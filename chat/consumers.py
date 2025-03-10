import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import User
from .models import Message
from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from django.core.cache import cache

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        user1 = self.scope['user'].username 
        user2 = self.room_name
        self.room_group_name = f"chat_{''.join(sorted([user1, user2]))}"

        await self.set_user_online(self.scope['user'].username)
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        await self.channel_layer.group_send(
            'presence',
            {
                'type': 'user_status',
                'user': self.scope['user'].username,
                'status': 'online'
            }
        )

        await self.mark_messages_as_delivered()

    async def disconnect(self, close_code):
        await self.set_user_offline(self.scope['user'].username)
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        await self.channel_layer.group_send(
            'presence',
            {
                'type': 'user_status',
                'user': self.scope['user'].username,
                'status': 'offline'
            }
        )

    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        action = text_data_json.get('action', 'new_message')

        if action == 'new_message':
            message = text_data_json['message']
            message_type = text_data_json.get('message_type', 'normal')
            subject = text_data_json.get('subject', 'none')
            sender = self.scope['user']
            receiver = await self.get_receiver_user()

            saved_message = await self.save_message(sender, receiver, message, message_type, subject)
            message_status = await self.get_message_status(saved_message)

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat_message',
                    'sender': sender.username,
                    'receiver': receiver.username,
                    'message': message,
                    'status': message_status,
                    'message_type': message_type,
                    'subject': subject,
                    'timestamp': saved_message.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    'message_id': str(saved_message.id)
                }
            )
        
        elif action == 'update_message':
            message_id = text_data_json['message_id']
            message_type = text_data_json.get('message_type')
            subject = text_data_json.get('subject')
            
            updated_message = await self.update_message(message_id, message_type, subject)
            
            if updated_message:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'message_updated',
                        'message_id': message_id,
                        'message_type': message_type,
                        'subject': subject
                    }
                )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'sender': event['sender'],
            'receiver': event['receiver'],
            'message': event['message'],
            'status': event['status'],
            'message_type': event['message_type'],
            'subject': event['subject'],
            'timestamp': event['timestamp'],
            'message_id': event['message_id']
        }))

    async def message_updated(self, event):
        await self.send(text_data=json.dumps({
            'action': 'message_updated',
            'message_id': event['message_id'],
            'message_type': event.get('message_type'),
            'subject': event.get('subject')
        }))

    async def user_status(self, event):
        await self.send(text_data=json.dumps({
            'type': 'status',
            'user': event['user'],
            'status': event['status']
        }))

    @sync_to_async
    def save_message(self, sender, receiver, message, message_type='normal', subject='none'):
        msg = Message.objects.create(
            sender=sender,
            receiver=receiver,
            content=message,
            status=Message.SENT,
            message_type=message_type,
            subject=subject
        )
        return msg

    @sync_to_async
    def update_message(self, message_id, message_type=None, subject=None):
        try:
            message = Message.objects.get(id=message_id)
            if message_type is not None:
                message.message_type = message_type
            if subject is not None:
                message.subject = subject
            message.save()
            return message
        except Message.DoesNotExist:
            return None

    @sync_to_async
    def get_message_status(self, message):
        return message.status

    @sync_to_async
    def mark_messages_as_delivered(self):
        Message.objects.filter(
            receiver=self.scope['user'],
            sender__username=self.room_name,
            status=Message.SENT
        ).update(status=Message.DELIVERED)

    @sync_to_async
    def mark_messages_as_read(self):
        Message.objects.filter(
            receiver=self.scope['user'],
            sender__username=self.room_name,
            status=Message.DELIVERED
        ).update(status=Message.READ)

    @sync_to_async
    def get_receiver_user(self):
        return User.objects.get(username=self.room_name)

    @sync_to_async
    def set_user_online(self, username):
        cache.set(f'user_status_{username}', 'online', timeout=None)

    @sync_to_async
    def set_user_offline(self, username):
        cache.set(f'user_status_{username}', 'offline', timeout=None)
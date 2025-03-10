document.addEventListener("DOMContentLoaded", function () {
  const chatbox = document.querySelector("#chatbox");

  function scrollToBottom() {
    chatbox.scrollTop = chatbox.scrollHeight;
  }

  function createStatusIndicator(status) {
    const statusDiv = document.createElement('div');
    statusDiv.className = 'message-status';
    
    if (status === 'sent') {
      statusDiv.innerHTML = '<i class="fas fa-check text-secondary ml-2"></i>';
    } else if (status === 'delivered') {
      statusDiv.innerHTML = '<i class="fas fa-check-double text-secondary ml-2"></i>';
    } else if (status === 'read') {
      statusDiv.innerHTML = '<i class="fas fa-check-double text-primary ml-2"></i>';
    }
    
    return statusDiv;
  }

  function createMessageElement(data, userUsername) {
    const messageContainer = document.createElement("div");
    messageContainer.className = "chat-message " + (data.sender === userUsername ? "sender" : "receiver");
    messageContainer.dataset.timestamp = data.timestamp;
    messageContainer.dataset.status = data.status;
    messageContainer.dataset.type = data.message_type;
    messageContainer.dataset.subject = data.subject;
    messageContainer.dataset.messageId = data.message_id;

    const messageContent = document.createElement("div");
    messageContent.className = "d-flex align-items-center position-relative";

    // Add options dropdown for sender's messages
    if (data.sender === userUsername) {
      const dropdownHtml = `
        <div class="dropdown message-options">
          <button class="btn btn-link text-muted dropdown-toggle" type="button" data-toggle="dropdown">
            <i class="fas fa-ellipsis-v"></i>
          </button>
          <div class="dropdown-menu">
            <a class="dropdown-item set-urgent" href="#">Mensaje Urgente</a>
            <a class="dropdown-item set-subject" href="#">Materia</a>
            <a class="dropdown-item show-details" href="#">Más detalles</a>
          </div>
        </div>
      `;
      messageContent.innerHTML = dropdownHtml;
    }

    const messageText = document.createElement("span");
    messageText.textContent = data.message;
    messageContent.appendChild(messageText);

    if (data.sender === userUsername) {
      messageContent.appendChild(createStatusIndicator(data.status));
    }

    messageContainer.appendChild(messageContent);

    // Add labels if needed
    if (data.message_type === 'urgent') {
      const urgentLabel = document.createElement("div");
      urgentLabel.className = "message-label urgent-label";
      urgentLabel.textContent = "Mensaje Urgente";
      messageContainer.appendChild(urgentLabel);
    }

    if (data.subject !== 'none') {
      const subjectLabel = document.createElement("div");
      subjectLabel.className = "message-label subject-label";
      subjectLabel.textContent = data.subject === 'programming' ? 'Programación' :
                                data.subject === 'math' ? 'Matemáticas' :
                                data.subject === 'english' ? 'Inglés' : data.subject;
      messageContainer.appendChild(subjectLabel);
    }

    return messageContainer;
  }

  scrollToBottom();

  const roomName = JSON.parse(document.getElementById("room_name").textContent);
  const userUsername = JSON.parse(document.getElementById("user_username").textContent);

  const chatSocket = new WebSocket(
    "wss://" + window.location.host + "/ws/chat/" + roomName + "/"
  );

  chatSocket.onopen = function (e) {
    console.log("The connection was set up successfully!");
  };
  
  chatSocket.onclose = function (e) {
    console.log("Something unexpected happened!");
  };

  document.querySelector("#my_input").focus();
  document.querySelector("#my_input").onkeyup = function (e) {
    if (e.keyCode == 13) {
      e.preventDefault();
      document.querySelector("#submit_button").click();
    }
  };

  // Handle message options
  $(document).on('click', '.set-urgent', function(e) {
    e.preventDefault();
    const messageContainer = $(this).closest('.chat-message');
    const messageId = messageContainer.data('messageId');
    
    chatSocket.send(JSON.stringify({
      action: 'update_message',
      message_id: messageId,
      message_type: 'urgent'
    }));
  });

  $(document).on('click', '.set-subject', function(e) {
    e.preventDefault();
    const messageContainer = $(this).closest('.chat-message');
    $('#subjectModal').modal('show');
    $('#subjectModal').data('messageContainer', messageContainer);
  });

  // Handle subject selection
  $('#subjectModal .list-group-item').click(function() {
    const subject = $(this).data('subject');
    const messageContainer = $('#subjectModal').data('messageContainer');
    const messageId = messageContainer.data('messageId');
    
    chatSocket.send(JSON.stringify({
      action: 'update_message',
      message_id: messageId,
      subject: subject
    }));
    
    $('#subjectModal').modal('hide');
  });

  $(document).on('click', '.show-details', function(e) {
    e.preventDefault();
    const messageContainer = $(this).closest('.chat-message');
    
    $('#messageTimestamp').text(messageContainer.data('timestamp'));
    $('#messageStatus').text(messageContainer.data('status'));
    $('#messageType').text(messageContainer.data('type') === 'urgent' ? 'Urgente' : 'Normal');
    
    const subject = messageContainer.data('subject');
    $('#messageSubject').text(
      subject === 'programming' ? 'Programación' :
      subject === 'math' ? 'Matemáticas' :
      subject === 'english' ? 'Inglés' :
      'Ninguna'
    );
    
    $('#messageDetailsModal').modal('show');
  });

  document.querySelector("#submit_button").onclick = function (e) {
    var messageInput = document.querySelector("#my_input").value;

    if (messageInput.length == 0) {
      alert("Add some input first or press the Send button!");
    } else {
      chatSocket.send(
        JSON.stringify({
          action: 'new_message',
          message: messageInput,
          username: userUsername,
          room_name: roomName,
          message_type: 'normal',
          subject: 'none'
        })
      );
      document.querySelector("#my_input").value = "";
    }
  };

  chatSocket.onmessage = function (e) {
    const data = JSON.parse(e.data);

    if (data.type === 'status') {
      const userItems = document.querySelectorAll('.list-group-item');
      userItems.forEach(item => {
        if (item.querySelector('strong').textContent === data.user) {
          const statusIndicator = item.querySelector('.status-indicator');
          statusIndicator.style.backgroundColor = data.status === 'online' ? '#28a745' : '#dc3545';
          
          if (data.user === roomName) {
            const statusText = document.querySelector('.text-muted');
            if (statusText) {
              statusText.textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1);
            }
          }
        }
      });
      return;
    }

    if (data.action === 'message_updated') {
      const messageContainer = $(`.chat-message[data-message-id="${data.message_id}"]`);
      
      // Update message type
      if (data.message_type) {
        messageContainer.attr('data-type', data.message_type);
        if (data.message_type === 'urgent') {
          if (!messageContainer.find('.urgent-label').length) {
            const label = $('<div class="message-label urgent-label">Mensaje Urgente</div>');
            messageContainer.append(label);
          }
        }
      }
      
      // Update subject
      if (data.subject) {
        messageContainer.attr('data-subject', data.subject);
        messageContainer.find('.subject-label').remove();
        const subjectText = data.subject === 'programming' ? 'Programación' :
                           data.subject === 'math' ? 'Matemáticas' :
                           data.subject === 'english' ? 'Inglés' : data.subject;
        const label = $(`<div class="message-label subject-label">${subjectText}</div>`);
        messageContainer.append(label);
      }
      
      return;
    }

    if (data.message && data.sender) {
      const chatbox = document.querySelector("#chatbox");
      const noMessages = document.querySelector(".no-messages");
      if (noMessages) {
        noMessages.style.display = "none";
      }

      const messageElement = createMessageElement(data, userUsername);
      chatbox.appendChild(messageElement);
      scrollToBottom();

      const lastMessage = document.querySelector(
        ".list-group-item.active #last-message"
      );
      if (lastMessage) {
        lastMessage.innerHTML =
          data.sender === userUsername
            ? "You: " + data.message
            : data.message;

        const timestamp = document.querySelector(".list-group-item.active small");
        const date = new Date().toUTCString();
        timestamp.innerHTML = date.slice(17, 22);

        const chats = document.querySelectorAll(".list-group-item");
        const chatsArray = Array.from(chats);
        const chatsSorted = chatsArray.sort((a, b) => {
          const aTime = a.querySelector("small").innerHTML;
          const bTime = b.querySelector("small").innerHTML;
          return aTime < bTime ? 1 : -1;
        });

        const contacts = document.querySelector(".contacts");
        contacts.innerHTML = "";
        chatsSorted.forEach((chat) => {
          contacts.appendChild(chat);
        });
      }
    }
  };
});
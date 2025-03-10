
from django.urls import path
from users.views import logout_page, signup_view, index, login_page

urlpatterns = [
    path('', index, name="index"),
    path('logout/', logout_page, name="logout"),
    path('signup/', signup_view, name="signup"),
    path('login/', login_page, name="login"),
]

from django.urls import path
from .views import tasks, task, addtask, updatetask, deletetask
urlpatterns = [
    path('', tasks, name='tasks'),
    path('task/<taskid>/', task, name='task'),
    path('addtask/', addtask, name='addtask'),
    path('updatetask/<taskid>/', updatetask, name='updatetask'),
    path('deletetask/<taskid>/', deletetask, name='deletetask'),
]

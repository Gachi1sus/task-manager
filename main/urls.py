from django.urls import path
from .views import tasks, task, addtask, updatetask, deletetask
from .api_views import api_tasks, api_task
urlpatterns = [
    path('', tasks, name='tasks'),
    path('task/<taskid>/', task, name='task'),
    path('addtask/', addtask, name='addtask'),
    path('updatetask/<taskid>/', updatetask, name='updatetask'),
    path('deletetask/<taskid>/', deletetask, name='deletetask'),
    path('api/tasks/', api_tasks, name='api_tasks'),
    path('api/tasks/<taskid>', api_task, name='api_task'),

]

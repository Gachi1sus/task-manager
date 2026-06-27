from django.urls import path, include
from .views import tasks, task, addtask, updatetask, deletetask
from rest_framework.routers import DefaultRouter
from .api_views import TaskViewSet
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
router = DefaultRouter()
router.register('api/tasks', TaskViewSet, basename='tasks')
urlpatterns = [
    path('', tasks, name='tasks'),
    path('task/<taskid>/', task, name='task'),
    path('addtask/', addtask, name='addtask'),
    path('updatetask/<taskid>/', updatetask, name='updatetask'),
    path('deletetask/<taskid>/', deletetask, name='deletetask'),
    path('', include(router.urls)),\
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

]

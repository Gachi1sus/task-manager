from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.viewsets import ModelViewSet
from .serializers import TaskSerializer
from .models import Task


class TaskViewSet(ModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer

    def get_permissions(self):
        if self.request.method in ['GET']:
            return [AllowAny()]

        return [IsAuthenticated()]
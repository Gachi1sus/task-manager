from rest_framework import status, response
from rest_framework.generics import CreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet
from .serializers import TaskSerializer, UserSerializer
from rest_framework.decorators import action
from .models import Task
from .permissions import IsOwner
from .services.ai import (
    breakdown_task,
    AIServiceUnavailable,
    AIServiceTimeout,
    AIInvalidResponse,
)

class TaskViewSet(ModelViewSet):
    queryset = Task.objects.none()
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated, IsOwner]

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['title', 'description']
    filterset_fields = ['status']
    ordering_fields = ['status','created_at']

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        task = self.get_object()
        task.status = 'done'
        task.save()

        serializer = self.get_serializer(task)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="ai-breakdown")
    def ai_breakdown(self, request, pk=None):
        task = self.get_object()

        try:
            result = breakdown_task(task)
        except AIServiceUnavailable:
            return Response(
                {"detail": "AI service is unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except AIServiceTimeout:
            return Response(
                {"detail": "AI service timed out."},
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except AIInvalidResponse:
            return Response(
                {"detail": "AI service returned an invalid response."},
                status=status.HTTP_502_BAD_GATEWAY
            )

        return Response(
            result,
            status=status.HTTP_200_OK,
        )

    def get_queryset(self):
        return Task.objects.filter(owner=self.request.user).select_related('owner')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)



class RegisterUser(CreateAPIView):
    serializer_class = UserSerializer

class MeView(RetrieveUpdateDestroyAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsOwner]

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)



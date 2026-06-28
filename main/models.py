from django.db import models
from django.contrib.auth.models import User
from django.conf import settings


class Task(models.Model):
    STATUS_CHOICES = [
        ('new', 'новая'),
        ('in_progress', 'В работе'),
        ('done', 'Выполнена'),
    ]

    owner = models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.CASCADE)
    title = models.CharField(max_length=100)
    description = models.TextField()
    status =  models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

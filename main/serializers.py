from rest_framework import serializers
from .models import Task, User, Profile

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ['avatar']


class UserShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username']

class TaskShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ['id', 'title', 'status']


class UserSerializer(serializers.ModelSerializer):
    tasks = TaskShortSerializer(many=True, read_only=True)
    profile = ProfileSerializer(read_only=True)
    avatar = serializers.ImageField(write_only=True, required=False)
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password','tasks','profile','avatar']
        extra_kwargs = {
            'password': {'write_only': True}
        }

    def update(self, instance, validated_data):
        avatar = validated_data.pop('avatar', None)

        instance.username = validated_data.get('username', instance.username)
        instance.email = validated_data.get('email', instance.email)

        if 'password' in validated_data:
            instance.set_password(validated_data['password'])

        if avatar:

            profile = instance.profile
            old_avatar_name = profile.avatar.name
            profile.avatar = avatar
            profile.save()
            if old_avatar_name:
                profile.avatar.storage.delete(old_avatar_name)

        instance.save()
        return instance

    def create(self, validated_data):
        user = User(
            username=validated_data['username'],
            email=validated_data.get('email', '')
        )
        user.set_password(validated_data['password'])
        user.save()
        Profile.objects.create(user=user)
        return user

class TaskSerializer(serializers.ModelSerializer):
    owner = UserShortSerializer(read_only=True)

    class Meta:
        model = Task
        fields = ['id', 'owner', 'title', 'description', 'status', 'created_at']

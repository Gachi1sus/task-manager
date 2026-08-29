from django.contrib.messages import api
from rest_framework.test import APITestCase
from .models import Task, User, Profile

class TaskAPITest(APITestCase):

    def setUp(self):
        self.owner = User.objects.create_user(
            username="Test",
            password="Test1234"
        )
        self.client.force_authenticate(user=self.owner)

    def test_user_can_create_task(self):
        data = {
            "title": "Тестовая задача",
            "description": "Тестовая задача для проверки безопасности",
            "status": "new",
        }

        response = self.client.post(
            "/api/tasks/",
            data=data,
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Task.objects.count(), 1)
        task = Task.objects.get()
        self.assertEqual(task.owner, self.owner)



    def test_user_cant_create_task(self):
        self.client.force_authenticate(user=None)
        data = {
            "title": "Тестовая задача",
            "description": "Тестовая задача для проверки безопасности",
            "status": "new",
        }

        response = self.client.post(
            "/api/tasks/",
            data=data,
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(Task.objects.count(), 0)

    def test_user_cant_access_another_users_task(self):
        second_user = User.objects.create_user(
            username="Test2",
            password="Test1234"
        )
        task = Task.objects.create(
            owner=self.owner,
            title="Тестовая задача",
            description="Тестовая задача для проверки безопасности",
            status="new"
        )



        self.client.force_authenticate(user=second_user)

        response = self.client.get(
            f"/api/tasks/{task.id}/"
        )

        self.assertEqual(response.status_code, 404)

    def test_user_cant_update_another_users_task(self):
        second_user = User.objects.create_user(
            username="Test2",
            password="Test1234"
        )
        data = {
            "title": "Изменение тестовой задачи"
        }
        task = Task.objects.create(
            owner=self.owner,
            title="Тестовая задача",
            description="Тестовая задача для проверки безопасности",
            status="new"
        )
        self.client.force_authenticate(user=second_user)

        response = self.client.patch(
            f"/api/tasks/{task.id}/",
            data=data
        )
        self.assertEqual(response.status_code, 404)
        task.refresh_from_db()
        self.assertEqual(task.title, "Тестовая задача")

    def test_user_cant_delete_another_users_task(self):
        second_user = User.objects.create_user(
            username="Test2",
            password="Test1234"
        )
        task = Task.objects.create(
            owner=self.owner,
            title="Тестовая задача",
            description="Тестовая задача для проверки безопасности",
            status="new"
        )
        self.client.force_authenticate(user=second_user)
        response = self.client.delete(
            f"/api/tasks/{task.id}/"
        )
        self.assertEqual(response.status_code, 404)
        self.assertTrue(
            Task.objects.filter(id=task.id).exists()
        )

    def test_user_can_delete_task(self):
        task = Task.objects.create(
            owner=self.owner,
            title="Тестовая задача",
            description="Тестовая задача для проверки безопасности",
            status="new"
        )
        response = self.client.delete(
            f"/api/tasks/{task.id}/"
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            Task.objects.filter(id=task.id).exists()
        )

    def test_user_cant_assign_another_owner_to_task(self):
        second_user = User.objects.create_user(
            username="Test2",
            password="Test1234"
        )
        data = {
            "title": "Тестовая задача",
            "description": "Тестовая задача для проверки безопасности",
            "status": "new",
            "owner": second_user.id,
        }
        response = self.client.post(
            "/api/tasks/",
            data=data,
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Task.objects.count(), 1)
        task = Task.objects.get()
        self.assertEqual(task.owner, self.owner)

    def test_complete_working(self):
        task = Task.objects.create(
            owner=self.owner,
            title="Тестовая задача",
            description="Тестовая задача для проверки безопасности",
            status="new"
        )
        response = self.client.post(
            f"/api/tasks/{task.id}/complete/",
        )
        self.assertEqual(response.status_code, 200)
        task.refresh_from_db()
        self.assertEqual(task.status, "done")
        self.assertEqual(response.data["status"], "done")
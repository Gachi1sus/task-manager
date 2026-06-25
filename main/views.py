from django.contrib import admin
from django.shortcuts import render, redirect

from .forms import TaskForm
from .models import Task


def tasks(request):
    status = request.GET.get('status')
    q = request.GET.get('q')
    sort = request.GET.get('sort')
    tasks = Task.objects.all()
    if status:
        tasks = Task.objects.filter(status=status)
    if q:
        tasks = tasks.filter(title__icontains=q)
    if sort:
        tasks = tasks.order_by(sort)

    return render(request, 'main/tasks.html', {'tasks': tasks})

def task(request, taskid):
    task = Task.objects.get(pk=taskid)
    return render(request, 'main/task.html', {'task': task})

def addtask(request):
    form = TaskForm()
    if request.method == 'POST':
        form = TaskForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect ('tasks')
    return render(request, 'main/taskadd.html', {'form': form})

def updatetask(request, taskid):
    task = Task.objects.get(pk=taskid)
    form = TaskForm(instance=task)
    if request.method == 'POST':
        form = TaskForm(request.POST, instance=task)
        if form.is_valid():
            form.save()
            return redirect('tasks')

    return render(request, 'main/updatetask.html', {'form': form})

def deletetask(request, taskid):
    task = Task.objects.get(pk=taskid)
    if request.method == 'POST':
        task.delete()
        return redirect('tasks')
    return render(request, 'main/deletetask.html', {'task': task})

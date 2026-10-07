"use server";

import { Priority, ProjectStatus, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { argAction, formAction } from "@/server/action";
import { zEnum, zId, zOptionalDate, zOptionalDueDate, zOptionalId, zOptionalText, zText } from "@/lib/validation";
import { createProject, createTask, deleteTask, setTaskStatus, updateTask } from "@/server/services/tasks";

const taskSchema = z.object({
  title: zText(200, "Title"),
  description: zOptionalText(5000),
  status: zEnum(TaskStatus, "a status"),
  priority: zEnum(Priority, "a priority"),
  dueDate: zOptionalDueDate,
  assigneeId: zOptionalId,
  departmentId: zOptionalId,
  projectId: zOptionalId,
  meetingId: zOptionalId,
  schoolId: zOptionalId,
  featureId: zOptionalId,
  bugId: zOptionalId,
});

export const createTaskAction = formAction(taskSchema, async (user, input) => {
  const task = await createTask(user, input);
  return { message: `Task #${task.number} created`, id: task.id };
});

export const updateTaskAction = formAction(taskSchema.extend({ id: zId }), async (user, { id, ...input }) => {
  await updateTask(user, id, input);
  return "Task updated";
});

export const setTaskStatusAction = argAction(z.object({ id: zId, status: zEnum(TaskStatus) }), async (user, { id, status }) => {
  await setTaskStatus(user, id, status);
  return status === "COMPLETED" ? "Task completed" : "Status updated";
});

export const deleteTaskAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteTask(user, id);
  return "Task deleted";
});

export const createProjectAction = formAction(
  z.object({
    name: zText(120, "Name"),
    description: zOptionalText(2000),
    status: zEnum(ProjectStatus, "a status"),
    ownerId: zOptionalId,
    departmentId: zOptionalId,
    startDate: zOptionalDate,
    dueDate: zOptionalDate,
  }),
  async (user, input) => {
    const project = await createProject(user, input);
    return { message: `Project “${project.name}” created`, id: project.id };
  },
);

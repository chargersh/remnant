"use client";

import { api } from "@remnant/backend/convex/_generated/api";
import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import { Button } from "@remnant/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@remnant/ui/components/card";
import { Checkbox } from "@remnant/ui/components/checkbox";
import { Input } from "@remnant/ui/components/input";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

export default function TodosPage() {
  const [newTodoText, setNewTodoText] = useState("");

  const todos = useQuery(api.todos.getAll);
  const createTodoMutation = useMutation(api.todos.create);
  const toggleTodoMutation = useMutation(api.todos.toggle);
  const deleteTodoMutation = useMutation(api.todos.deleteTodo);

  const handleAddTodo = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = newTodoText.trim();
    if (!text) {
      return;
    }
    await createTodoMutation({ text });
    setNewTodoText("");
  };

  const handleToggleTodo = (id: Id<"todos">, currentCompleted: boolean) => {
    toggleTodoMutation({ id, completed: !currentCompleted });
  };

  const handleDeleteTodo = (id: Id<"todos">) => {
    deleteTodoMutation({ id });
  };

  let todosContent: ReactNode;

  if (todos === undefined) {
    todosContent = (
      <div className="flex justify-center py-4">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  } else if (todos.length === 0) {
    todosContent = (
      <p className="py-4 text-center">No todos yet. Add one above!</p>
    );
  } else {
    todosContent = (
      <ul className="space-y-2">
        {todos.map((todo) => (
          <li
            className="flex items-center justify-between rounded-md border p-2"
            key={todo._id}
          >
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={todo.completed}
                id={`todo-${todo._id}`}
                onCheckedChange={() =>
                  handleToggleTodo(todo._id, todo.completed)
                }
              />
              <label
                className={`${todo.completed ? "text-muted-foreground line-through" : ""}`}
                htmlFor={`todo-${todo._id}`}
              >
                {todo.text}
              </label>
            </div>
            <Button
              aria-label="Delete todo"
              onClick={() => handleDeleteTodo(todo._id)}
              size="icon"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md py-10">
      <Card>
        <CardHeader>
          <CardTitle>Todo List</CardTitle>
          <CardDescription>Manage your tasks efficiently</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="mb-6 flex items-center space-x-2"
            onSubmit={handleAddTodo}
          >
            <Input
              onChange={(e) => setNewTodoText(e.target.value)}
              placeholder="Add a new task..."
              value={newTodoText}
            />
            <Button disabled={!newTodoText.trim()} type="submit">
              Add
            </Button>
          </form>

          {todosContent}
        </CardContent>
      </Card>
    </div>
  );
}

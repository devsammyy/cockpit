"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { usePlanAndExecute } from "@/hooks/use-api";

const goalSchema = z.object({
  goal: z
    .string()
    .min(12, "Describe the goal in at least 12 characters so the planner has enough context.")
    .max(2000),
});

type GoalForm = z.infer<typeof goalSchema>;

interface RunGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Run a goal": natural-language goal → Qwen plans a workflow DAG → execution
 * starts immediately. On success we jump straight to the live execution view.
 */
export function RunGoalDialog({ open, onOpenChange }: RunGoalDialogProps) {
  const router = useRouter();
  const planAndExecute = usePlanAndExecute();

  const form = useForm<GoalForm>({
    defaultValues: { goal: "" },
    resolver: zodResolver(goalSchema),
  });

  const onSubmit = form.handleSubmit((values) => {
    planAndExecute.mutate(values.goal, {
      onSuccess: (result) => {
        toast.success("Workflow planned — execution started", {
          description: `${String(result.plannedGraph.steps.length)} steps planned by Qwen`,
        });
        onOpenChange(false);
        form.reset();
        router.push(`/executions/${result.executionId}`);
      },
    });
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles aria-hidden className="size-4 text-primary" /> Run an autonomous goal
          </DialogTitle>
          <DialogDescription>
            Describe a business goal in plain language. Qwen plans an executable workflow and the
            engine runs it immediately — you can watch every step live.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              void onSubmit(event);
            }}
          >
            <FormField
              control={form.control}
              name="goal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Goal</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[120px]"
                      placeholder="e.g. Categorize the latest support ticket, run database diagnostics, and alert the engineering channel if the issue is critical."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    The planner can use every registered tool and Qwen agent capability.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                onClick={() => {
                  onOpenChange(false);
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={planAndExecute.isPending} type="submit">
                {planAndExecute.isPending ? "Planning…" : "Plan & execute"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

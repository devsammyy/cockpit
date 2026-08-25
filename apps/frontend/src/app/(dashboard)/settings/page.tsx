"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile, useUpdateProfile } from "@/hooks/use-api";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

const profileSchema = z.object({
  displayName: z.string().min(2, "Display name must be at least 2 characters."),
});

type ProfileForm = z.infer<typeof profileSchema>;

const THEME_OPTIONS = [
  { icon: Sun, label: "Light", value: "light" },
  { icon: Moon, label: "Dark", value: "dark" },
  { icon: Monitor, label: "System", value: "system" },
] as const;

export default function SettingsPage() {
  const profileQuery = useProfile();
  const updateProfile = useUpdateProfile();
  const { theme, setTheme } = useTheme();
  const mounted = useHydrated();

  const form = useForm<ProfileForm>({
    defaultValues: { displayName: "" },
    resolver: zodResolver(profileSchema),
    values: profileQuery.data ? { displayName: profileQuery.data.displayName } : undefined,
  });

  const onSubmit = form.handleSubmit((values) => {
    updateProfile.mutate(values);
  });

  return (
    <>
      <PageHeader
        description="Your account preferences. Organization-wide administration lives under Organization settings."
        title="Settings"
      />

      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How you appear across the console and audit logs.</CardDescription>
          </CardHeader>
          <CardContent>
            {profileQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-64" />
              </div>
            ) : (
              <Form {...form}>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    void onSubmit(event);
                  }}
                >
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input disabled id="profile-email" value={profileQuery.data?.email ?? ""} />
                    <p className="text-xs text-muted-foreground">
                      Email is your sign-in identity and cannot be changed here.
                    </p>
                  </div>
                  <Button disabled={updateProfile.isPending} type="submit">
                    {updateProfile.isPending ? "Saving…" : "Save profile"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Theme preference is stored per device.</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              aria-label="Theme"
              className="grid grid-cols-3 gap-2 sm:max-w-sm"
              role="radiogroup"
            >
              {THEME_OPTIONS.map((option) => {
                const isActive = mounted && theme === option.value;
                return (
                  <button
                    aria-checked={isActive}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive ? "border-primary bg-primary/5" : "hover:bg-accent",
                    )}
                    key={option.value}
                    onClick={() => {
                      setTheme(option.value);
                    }}
                    role="radio"
                    type="button"
                  >
                    <option.icon aria-hidden className="size-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

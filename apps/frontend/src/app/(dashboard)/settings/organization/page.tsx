"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus, Users } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorState } from "@/components/patterns/error-state";
import { TableSkeleton } from "@/components/patterns/loading";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useInviteMember, useMembers, useProfile } from "@/hooks/use-api";
import { useAuthStore } from "@/state/auth-store";

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  roleName: z.string(),
});

type InviteForm = z.infer<typeof inviteSchema>;

const INVITE_ROLES = ["Owner", "Admin", "Member", "Viewer"];

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invite = useInviteMember();
  const form = useForm<InviteForm>({
    defaultValues: { email: "", roleName: "Member" },
    resolver: zodResolver(inviteSchema),
  });

  const onSubmit = form.handleSubmit((values) => {
    invite.mutate(values, {
      onSuccess: () => {
        onOpenChange(false);
        form.reset();
      },
    });
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            The user must already have a platform account; they gain access to this organization
            with the selected role.
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="teammate@company.com" type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roleName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select defaultValue={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {INVITE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Roles map to permission policies enforced by the API on every request.
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
              <Button disabled={invite.isPending} type="submit">
                <UserPlus /> {invite.isPending ? "Inviting…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function OrganizationSettingsPage() {
  const membersQuery = useMembers();
  const profileQuery = useProfile();
  const user = useAuthStore((state) => state.user);
  const [inviteOpen, setInviteOpen] = React.useState(false);

  const members = membersQuery.data ?? [];
  const activeOrg = profileQuery.data?.memberships?.find(
    (membership) => membership.organization.id === user?.activeOrgId,
  )?.organization;

  return (
    <>
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setInviteOpen(true);
            }}
          >
            <UserPlus /> Invite member
          </Button>
        }
        description={
          activeOrg
            ? `Members and access control for ${activeOrg.name}.`
            : "Members and access control for the active organization."
        }
        title="Organization"
      />

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Everyone with access to this organization&apos;s agents, workflows, and data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membersQuery.isError ? (
            <ErrorState error={membersQuery.error} onRetry={() => void membersQuery.refetch()} />
          ) : membersQuery.isLoading ? (
            <TableSkeleton rows={4} />
          ) : members.length === 0 ? (
            <EmptyState
              description="Invite teammates to collaborate on workflows and approvals."
              icon={Users}
              title="Just you so far"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{initials(member.user.displayName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {member.user.displayName}
                            {member.user.id === user?.id ? (
                              <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {member.user.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{member.role?.name ?? "Member"}</Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge status={member.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InviteDialog onOpenChange={setInviteOpen} open={inviteOpen} />
    </>
  );
}

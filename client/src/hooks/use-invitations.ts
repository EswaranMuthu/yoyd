import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateInvitationRequest, type UpdateInvitationStatusRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/auth-utils";

export function useInvitations() {
  return useQuery({
    queryKey: [api.invitations.list.path],
    queryFn: async () => {
      const res = await fetch(api.invitations.list.path, { credentials: "include" });
      if (res.status === 401) throw new Error("401: Unauthorized");
      if (!res.ok) throw new Error("Failed to fetch invitations");
      return api.invitations.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateInvitationRequest) => {
      const validated = api.invitations.create.input.parse(data);
      const res = await fetch(api.invitations.create.path, {
        method: api.invitations.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (res.status === 401) throw new Error("401: Unauthorized");
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.invitations.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to send invitation");
      }
      return api.invitations.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      toast({ title: "Invitation Sent", description: "They should receive an email shortly." });
    },
    onError: (error) => {
      if (!isUnauthorizedError(error)) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });
}

export function useRespondInvitation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number } & UpdateInvitationStatusRequest) => {
      const validated = api.invitations.respond.input.parse({ status });
      const url = buildUrl(api.invitations.respond.path, { id });
      
      const res = await fetch(url, {
        method: api.invitations.respond.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (res.status === 401) throw new Error("401: Unauthorized");
      if (!res.ok) {
        if (res.status === 404) throw new Error("Invitation not found");
        throw new Error("Failed to update invitation");
      }
      return api.invitations.respond.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.invitations.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.projects.list.path] }); // Might have new projects
      toast({ title: "Success", description: "Invitation status updated" });
    },
    onError: (error) => {
      if (!isUnauthorizedError(error)) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });
}

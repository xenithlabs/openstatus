"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@openstatus/ui/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@openstatus/ui/components/ui/form";
import { Input } from "@openstatus/ui/components/ui/input";
import {
  RadioGroup,
  RadioGroupItem,
} from "@openstatus/ui/components/ui/radio-group";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  FormCard,
  FormCardContent,
  FormCardDescription,
  FormCardFooter,
  FormCardHeader,
  FormCardTitle,
} from "@/components/forms/form-card";

const schema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("resend"),
  }),
  z.object({
    provider: z.literal("smtp"),
    smtpHost: z.string().min(1, "SMTP host is required"),
    smtpPort: z.number().int().min(1).max(65535),
    smtpUser: z.string().min(1, "SMTP username is required"),
    smtpPass: z.string().min(1, "SMTP password is required"),
    smtpFrom: z.string().min(1, "From address is required"),
  }),
]);

type FormValues = z.infer<typeof schema>;

interface EmailConfig {
  provider: "resend" | "smtp";
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
}

export function FormEmailConfig({
  defaultValues,
  onSubmit,
  ...props
}: Omit<React.ComponentProps<"form">, "onSubmit"> & {
  defaultValues?: EmailConfig;
  onSubmit: (values: FormValues) => Promise<void>;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues?.provider === "smtp"
      ? {
          provider: "smtp",
          smtpHost: defaultValues.smtpHost ?? "",
          smtpPort: defaultValues.smtpPort ?? 587,
          smtpUser: defaultValues.smtpUser ?? "",
          smtpPass: defaultValues.smtpPass ?? "",
          smtpFrom: defaultValues.smtpFrom ?? "",
        }
      : { provider: "resend" },
  });
  const [isPending, startTransition] = useTransition();

  const provider = form.watch("provider");

  function submitAction(values: FormValues) {
    if (isPending) return;

    startTransition(async () => {
      try {
        const promise = onSubmit(values);
        toast.promise(promise, {
          loading: "Saving...",
          success: () => "Saved",
          error: "Failed to save",
        });
        await promise;
      } catch (error) {
        console.error(error);
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submitAction)} {...props}>
        <FormCard>
          <FormCardHeader>
            <FormCardTitle>Email Delivery</FormCardTitle>
            <FormCardDescription>
              Choose how notification emails are sent from your workspace.
            </FormCardDescription>
          </FormCardHeader>
          <FormCardContent>
            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={(val) => {
                        field.onChange(val);
                        if (val === "smtp") {
                          form.setValue("smtpHost", defaultValues?.smtpHost ?? "");
                          form.setValue("smtpPort", defaultValues?.smtpPort ?? 587);
                          form.setValue("smtpUser", defaultValues?.smtpUser ?? "");
                          form.setValue("smtpPass", defaultValues?.smtpPass ?? "");
                          form.setValue("smtpFrom", defaultValues?.smtpFrom ?? "");
                        }
                      }}
                      className="gap-3 sm:grid-cols-2"
                    >
                      <label className="hover:bg-muted/40 has-[[aria-checked=true]]:border-primary flex cursor-pointer items-start gap-3 rounded-md border p-3">
                        <RadioGroupItem value="resend" className="mt-1" />
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium">Resend</div>
                          <div className="text-muted-foreground text-xs">
                            Use the Resend API key from your environment.
                          </div>
                        </div>
                      </label>
                      <label className="hover:bg-muted/40 has-[[aria-checked=true]]:border-primary flex cursor-pointer items-start gap-3 rounded-md border p-3">
                        <RadioGroupItem value="smtp" className="mt-1" />
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium">SMTP</div>
                          <div className="text-muted-foreground text-xs">
                            Use your own SMTP server for self-hosted deployments.
                          </div>
                        </div>
                      </label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {provider === "smtp" && (
              <div className="mt-4 space-y-4">
                <FormField
                  control={form.control}
                  name="smtpHost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMTP Host</FormLabel>
                      <FormControl>
                        <Input placeholder="smtp.example.com" {...field} />
                      </FormControl>
                      <FormDescription>
                        Your SMTP server hostname.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="smtpPort"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMTP Port</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="587"
                          {...field}
                          onChange={(e) =>
                            field.onChange(e.target.valueAsNumber || 587)
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Usually 587 (STARTTLS) or 465 (SSL).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="smtpUser"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMTP Username</FormLabel>
                      <FormControl>
                        <Input placeholder="user@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="smtpPass"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMTP Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="smtpFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="notifications@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        The email address notifications appear to come from.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </FormCardContent>
          <FormCardFooter>
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? "Saving..." : "Save"}
            </Button>
          </FormCardFooter>
        </FormCard>
      </form>
    </Form>
  );
}

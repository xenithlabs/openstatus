"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@openstatus/ui/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@openstatus/ui/components/ui/form";
import { Form } from "@openstatus/ui/components/ui/form";
import { Input } from "@openstatus/ui/components/ui/input";
import { Label } from "@openstatus/ui/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@openstatus/ui/components/ui/radio-group";
import { Textarea } from "@openstatus/ui/components/ui/textarea";
import { useDebounce } from "@openstatus/ui/hooks/use-debounce";
import { cn } from "@openstatus/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isTRPCClientError } from "@trpc/client";
import { Globe, Link2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

// FIXME: use input-group instead
import { InputWithAddons } from "@/components/common/input-with-addons";
import {
  FormCard,
  FormCardContent,
  FormCardDescription,
  FormCardFooter,
  FormCardHeader,
  FormCardSeparator,
  FormCardTitle,
} from "@/components/forms/form-card";
import { useTRPC } from "@/lib/trpc/client";

const SLUG_UNIQUE_ERROR_MESSAGE =
  "This slug is already taken. Please choose another one.";

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const SLUG_PATTERN_MESSAGE =
  "Only use digits (0-9), hyphen (-) or lowercase characters (a-z).";

function formatSlug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugFromDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);
}

const HOST_MODE_OPTIONS = [
  {
    value: "subdomain" as const,
    label: "Subdomain",
    icon: Globe,
    description: "Host on openstatus.dev",
  },
  {
    value: "custom" as const,
    label: "Custom Domain",
    icon: Link2,
    description: "Use your own domain",
  },
] as const;

const schema = z
  .object({
    title: z.string().min(1, "Title is required"),
    slug: z.string().regex(SLUG_PATTERN, SLUG_PATTERN_MESSAGE).optional(),
    hostMode: z.enum(["subdomain", "custom"]).optional(),
    customDomain: z.string().optional(),
    icon: z.string().optional(),
    description: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.hostMode === "subdomain" && !data.slug?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Subdomain slug is required",
        path: ["slug"],
      });
    }
    if (data.hostMode === "custom" && !data.customDomain?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Custom domain is required",
        path: ["customDomain"],
      });
    }
  });

export type FormValues = z.infer<typeof schema>;

/** Convert a File to a base64 string without the data: prefix */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function FormGeneral({
  disabled,
  defaultValues,
  onSubmit,
  ...props
}: Omit<React.ComponentProps<"form">, "onSubmit"> & {
  defaultValues?: FormValues;
  onSubmit: (values: FormValues) => Promise<void>;
  disabled?: boolean;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {
      title: "",
      slug: "",
      hostMode: "subdomain",
      customDomain: "",
      icon: undefined,
      description: "",
    },
  });
  const [isPending, startTransition] = useTransition();
  const trpc = useTRPC();
  const uploadMutation = useMutation(trpc.blob.upload.mutationOptions());
  const watchSlug = form.watch("slug");
  const watchTitle = form.watch("title");
  const watchIcon = form.watch("icon");
  const watchHostMode = form.watch("hostMode");
  const watchCustomDomain = form.watch("customDomain");

  // Hide the host mode toggle when editing an existing page —
  // hosting mode is fixed after creation.
  const isEditing = !!defaultValues?.slug;

  const debouncedSlug = useDebounce(watchSlug ?? "", 500);
  const { data: isUnique } = useQuery(
    trpc.page.getSlugUniqueness.queryOptions(
      { slug: debouncedSlug },
      { enabled: debouncedSlug.length > 0 },
    ),
  );

  // Auto-derive slug from title (subdomain mode only — user controls slug in custom mode)
  useEffect(() => {
    if (!defaultValues?.slug && watchHostMode === "subdomain" && watchTitle) {
      form.setValue("slug", formatSlug(watchTitle));
    }
  }, [watchHostMode, form, defaultValues?.slug, watchTitle]);

  useEffect(() => {
    if (isUnique === undefined) return;
    if (defaultValues?.slug === debouncedSlug) return;

    if (!isUnique) {
      form.setError("slug", { message: SLUG_UNIQUE_ERROR_MESSAGE });
    } else {
      form.clearErrors("slug");
    }
  }, [isUnique, form, debouncedSlug, defaultValues?.slug]);

  function submitAction(values: FormValues) {
    if (isPending || disabled) return;

    startTransition(async () => {
      try {
        if (isUnique === false && defaultValues?.slug !== values.slug) {
          toast.error(SLUG_UNIQUE_ERROR_MESSAGE);
          form.setError("slug", { message: SLUG_UNIQUE_ERROR_MESSAGE });
          return;
        }

        const promise = onSubmit(values);
        toast.promise(promise, {
          loading: "Saving...",
          success: "Saved",
          error: (error) => {
            if (isTRPCClientError(error)) {
              return error.message;
            }
            return "Failed to save";
          },
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
            <FormCardTitle>General</FormCardTitle>
            <FormCardDescription>
              Configure the essential details for your status page.
            </FormCardDescription>
          </FormCardHeader>
          <FormCardSeparator />
          <FormCardContent className="grid gap-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="My Status Page" {...field} />
                  </FormControl>
                  <FormMessage />
                  <FormDescription>
                    Enter a descriptive name for your status page.
                  </FormDescription>
                </FormItem>
              )}
            />

            {!isEditing && (
            <FormField
              control={form.control}
              name="hostMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hosting</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={(v) =>
                        field.onChange(v as "subdomain" | "custom")
                      }
                      className="grid grid-cols-2 gap-4"
                    >
                      {HOST_MODE_OPTIONS.map((opt) => (
                        <Label
                          key={opt.value}
                          htmlFor={`host-mode-${opt.value}`}
                          className={cn(
                            "flex flex-col items-center gap-2 rounded-lg border p-4 cursor-pointer",
                            "hover:bg-accent hover:text-accent-foreground",
                            field.value === opt.value &&
                              "border-primary bg-accent text-accent-foreground",
                          )}
                        >
                          <RadioGroupItem
                            value={opt.value}
                            id={`host-mode-${opt.value}`}
                            className="sr-only"
                          />
                          <opt.icon className="size-5" />
                          <div className="text-center">
                            <div className="text-sm font-medium">
                              {opt.label}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {opt.description}
                            </div>
                          </div>
                        </Label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            )}

            {watchHostMode === "subdomain" ? (
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <InputWithAddons
                        placeholder="status"
                        trailing=".openstatus.dev"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Choose a unique subdomain for your status page.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="customDomain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Domain</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="status.example.com"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Enter your custom domain (e.g. status.yourcompany.com).
                      You&apos;ll need to configure DNS after creation.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {watchHostMode === "custom" && (
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Identifier</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={slugFromDomain(watchCustomDomain ?? "") || "status-page"}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Internal identifier for your status page. Auto-generated
                      from your domain if left empty.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="icon"
              render={() => (
                <FormItem>
                  <FormLabel>Icon</FormLabel>
                  <FormControl>
                    <div className="flex items-center space-x-2">
                      {watchIcon ? (
                        <>
                          <div className="bg-muted size-[36px] overflow-hidden rounded-md border">
                            <Image
                              src={watchIcon}
                              width={36}
                              height={36}
                              alt="Icon preview"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => form.setValue("icon", undefined)}
                          >
                            Remove
                          </Button>
                        </>
                      ) : (
                        <Input
                          type="file"
                          accept="image/png,image/x-icon,image/svg+xml"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const base64String = await fileToBase64(file);
                            try {
                              const blob = await uploadMutation.mutateAsync({
                                filename: file.name,
                                file: base64String,
                              });
                              if (blob?.url) {
                                form.setValue("icon", blob.url as string);
                              }
                            } catch (err) {
                              console.error(err);
                              toast.error("Upload failed");
                            }
                          }}
                        />
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                  <FormDescription>
                    Select an icon for your status page. PNG/ICO: 512x512px
                    recommended. SVG also supported. Will be used as favicon.
                  </FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                  <FormDescription>
                    Provide a brief overview of your status page purpose.
                  </FormDescription>
                </FormItem>
              )}
            />
          </FormCardContent>
          <FormCardFooter>
            <Button type="submit" disabled={isPending || disabled}>
              {isPending ? "Submitting..." : "Submit"}
            </Button>
          </FormCardFooter>
        </FormCard>
      </form>
    </Form>
  );
}

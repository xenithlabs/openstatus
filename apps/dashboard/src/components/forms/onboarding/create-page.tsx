"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { THEME_KEYS, type ThemeKey } from "@openstatus/theme-store";
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
import { Label } from "@openstatus/ui/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@openstatus/ui/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openstatus/ui/components/ui/select";
import { cn } from "@openstatus/ui/lib/utils";
import { useDebounce } from "@openstatus/ui/hooks/use-debounce";
import { useQuery } from "@tanstack/react-query";
import { isTRPCClientError } from "@trpc/client";
import { Globe, Laptop, Link2, Moon, Plus, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

// FIXME: use input-group instead
import { InputWithAddons } from "@/components/common/input-with-addons";
import { ThemePickerPopover } from "@/components/forms/status-page/theme-picker";
import { useTRPC } from "@/lib/trpc/client";

const SLUG_UNIQUE_ERROR_MESSAGE =
  "This slug is already taken. Please choose another one.";

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const SLUG_PATTERN_MESSAGE =
  "Only use digits (0-9), hyphen (-) or lowercase characters (a-z).";

const FORCE_THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const;

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

const schema = z
  .object({
    slug: z.string().regex(SLUG_PATTERN, SLUG_PATTERN_MESSAGE).optional(),
    hostMode: z.enum(["subdomain", "custom"]),
    customDomain: z.string().optional(),
    theme: z.enum(THEME_KEYS as [ThemeKey, ...ThemeKey[]]),
    forceTheme: z.enum(["light", "dark", "system"]),
    components: z
      .array(
        z.object({
          name: z.string().min(1, "Component name is required"),
        }),
      )
      .optional(),
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

export function CreatePageForm({
  defaultValues,
  onSubmit,
  onValuesChange,
  showComponents = false,
  ...props
}: Omit<React.ComponentProps<"form">, "onSubmit"> & {
  defaultValues?: Partial<FormValues>;
  onSubmit: (values: FormValues) => Promise<void>;
  onValuesChange?: (values: FormValues) => void;
  showComponents?: boolean;
}) {
  const trpc = useTRPC();
  const { theme: dashboardTheme, setTheme: setDashboardTheme } = useTheme();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      slug: "",
      hostMode: "subdomain",
      customDomain: "",
      theme: "default-rounded",
      forceTheme:
        dashboardTheme === "dark" || dashboardTheme === "light"
          ? dashboardTheme
          : "system",
      components: showComponents ? [{ name: "Website" }] : undefined,
      ...defaultValues,
    },
  });
  const [isPending, startTransition] = useTransition();
  const watchSlug = form.watch("slug");
  const watchHostMode = form.watch("hostMode");
  const watchCustomDomain = form.watch("customDomain");
  const debouncedSlug = useDebounce(watchSlug ?? "", 500);
  const { data: isUnique } = useQuery(
    trpc.page.getSlugUniqueness.queryOptions(
      { slug: debouncedSlug },
      { enabled: debouncedSlug.length > 0 },
    ),
  );

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "components",
  });

  // Show derived slug as placeholder hint only — user controls the slug directly

  useEffect(() => {
    if (isUnique === false) {
      form.setError("slug", { message: SLUG_UNIQUE_ERROR_MESSAGE });
    } else {
      form.clearErrors("slug");
    }
  }, [isUnique, form]);

  useEffect(() => {
    if (!onValuesChange) return;
    onValuesChange(form.getValues());
    const sub = form.watch((values) => {
      onValuesChange(values as FormValues);
    });
    return () => sub.unsubscribe();
  }, [form, onValuesChange]);

  function submitAction(values: FormValues) {
    if (isPending) return;

    startTransition(async () => {
      try {
        if (isUnique === false) {
          toast.error(SLUG_UNIQUE_ERROR_MESSAGE);
          form.setError("slug", { message: SLUG_UNIQUE_ERROR_MESSAGE });
          return;
        }

        const promise = onSubmit(values);
        toast.promise(promise, {
          loading: "Saving...",
          success: () => "Saved",
          error: (error) => {
            if (isTRPCClientError(error)) {
              return error.message;
            }
            console.error(error);
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
      <form
        onSubmit={form.handleSubmit(submitAction)}
        className="space-y-4"
        {...props}
      >
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
                  className="grid grid-cols-2 gap-3"
                >
                  {HOST_MODE_OPTIONS.map((opt) => (
                    <Label
                      key={opt.value}
                      htmlFor={`create-host-${opt.value}`}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border p-3 cursor-pointer",
                        "hover:bg-accent hover:text-accent-foreground",
                        field.value === opt.value &&
                          "border-primary bg-accent text-accent-foreground",
                      )}
                    >
                      <RadioGroupItem
                        value={opt.value}
                        id={`create-host-${opt.value}`}
                        className="sr-only"
                      />
                      <opt.icon className="size-4" />
                      <div className="text-center">
                        <div className="text-xs font-medium">{opt.label}</div>
                      </div>
                    </Label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
                <FormMessage />
                <FormDescription>
                  Choose a unique subdomain for your status page (minimum 3
                  characters).
                </FormDescription>
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
                  Use your own domain (e.g. status.yourcompany.com).
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
                    placeholder={
                      slugFromDomain(watchCustomDomain ?? "") ||
                      "status-page"
                    }
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Internal identifier. Auto-generated from your domain if left
                  empty.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="theme"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>Style</FormLabel>
                <ThemePickerPopover
                  value={field.value}
                  onChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="forceTheme"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>Mode</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    setDashboardTheme(v);
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Mode" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {FORCE_THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <SelectItem key={value} value={value}>
                        <div className="flex items-center gap-2">
                          <Icon className="size-4" />
                          <span>{label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {showComponents && (
          <div className="space-y-3">
            <FormLabel>Components</FormLabel>
            <FormDescription>
              Add the services your users care about. You can attach monitors
              later.
            </FormDescription>
            <div className="space-y-2">
              {fields.map((field, index) => (
                <FormField
                  key={field.id}
                  control={form.control}
                  name={`components.${index}.name`}
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input placeholder="e.g. API, Dashboard" {...field} />
                        </FormControl>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={() => remove(index)}
                          >
                            <X className="size-4" />
                          </Button>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            {fields.length < 3 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ name: "" })}
              >
                <Plus className="mr-1 size-4" />
                Add another
              </Button>
            )}
          </div>
        )}
      </form>
    </Form>
  );
}

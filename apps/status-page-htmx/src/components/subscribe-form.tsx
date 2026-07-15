import type { FC } from "hono/jsx";

export interface SubscribeFormProps {
  prefix: string;
}

/**
 * Email subscription form with HTMX POST.
 * On success, the form is replaced with a confirmation message.
 */
export const SubscribeForm: FC<SubscribeFormProps> = ({ prefix }) => {
  return (
    <div class="rounded-lg p-px shadow-sm dark:shadow-none">
      <div class="relative rounded-[7px] bg-card">
        <div class="rounded-t-[7px] text-base font-medium px-4 py-3.5">
          <h2 class="text-foreground">Subscribe to updates</h2>
        </div>
        <div class="px-4 pb-4">
          <form
            hx-post={`${prefix}/subscribe`}
            hx-target="#subscribe-result"
            hx-swap="outerHTML"
            class="flex flex-col gap-4"
          >
            <div class="flex flex-col gap-2">
              <label for="email" class="text-sm text-muted-foreground">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <button
              type="submit"
              class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Subscribe
            </button>
          </form>

          <div id="subscribe-result" />
        </div>
      </div>
    </div>
  );
};

/**
 * Success message shown after successful subscription.
 */
export const SubscribeSuccess: FC<{ email: string }> = ({ email }) => {
  return (
    <div
      id="subscribe-result"
      class="rounded-lg border border-success/20 bg-success/5 p-4 mt-4"
    >
      <p class="text-sm text-foreground font-medium">
        Check your email
      </p>
      <p class="text-sm text-muted-foreground mt-1">
        We sent a confirmation link to <strong>{email}</strong>.
        Click the link to verify your subscription.
      </p>
    </div>
  );
};

/**
 * Error message shown on subscription failure.
 */
export const SubscribeError: FC<{ message: string }> = ({ message }) => {
  return (
    <div
      id="subscribe-result"
      class="rounded-lg border border-destructive/20 bg-destructive/5 p-4 mt-4"
    >
      <p class="text-sm text-destructive">{message}</p>
    </div>
  );
};

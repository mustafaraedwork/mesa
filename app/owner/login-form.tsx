'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signInOwner } from './actions';

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signInOwner(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form action={onSubmit} className="space-y-4" autoComplete="off">
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium">
          البريد الإلكتروني
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="off"
          required
          dir="ltr"
          spellCheck={false}
          className="text-left"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium">
          كلمة السر
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          dir="ltr"
          spellCheck={false}
          className="text-left"
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? '...جارٍ الدخول' : 'دخول'}
      </Button>
    </form>
  );
}

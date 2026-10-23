"use client";

import type { ComponentProps } from "react";

/**
 * A submit button that asks before the form goes off. Used for destructive
 * one-click actions (deleting a conversation) so a stray click can't lose
 * data; without JavaScript it degrades to a plain submit.
 */
export function ConfirmSubmit({ message, onClick, ...props }: ComponentProps<"button"> & { message: string }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    />
  );
}

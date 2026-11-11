// Field (label + hint + error wired with aria-describedby), TextInput and TextArea.
'use client'

import { CircleAlert } from 'lucide-react'
import {
  Children, cloneElement, forwardRef, isValidElement, type InputHTMLAttributes, type ReactElement, type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { cx } from './cx'

export interface FieldProps {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  optional?: boolean
  className?: string
  children: ReactNode
}

export const fieldHintId = (htmlFor: string) => `${htmlFor}-hint`
export const fieldErrorId = (htmlFor: string) => `${htmlFor}-error`

export function Field({ label, htmlFor, hint, error, optional, className, children }: FieldProps) {
  const describedBy = [hint ? fieldHintId(htmlFor) : null, error ? fieldErrorId(htmlFor) : null].filter(Boolean).join(' ') || undefined
  const only = Children.count(children) === 1 ? Children.only(children) : null
  const control = only && isValidElement(only)
    ? cloneElement(only as ReactElement<Record<string, unknown>>, {
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })
    : children
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
        {optional && <span className="font-normal text-ink-3"> (optional)</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={fieldHintId(htmlFor)} className="text-sm text-ink-3">{hint}</p>
      )}
      {hint && error && <span id={fieldHintId(htmlFor)} className="sr-only">{hint}</span>}
      {error && (
        <p id={fieldErrorId(htmlFor)} role="alert" className="flex items-start gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

const inputBase = cx(
  'w-full rounded-md border bg-surface px-3.5 text-base text-ink placeholder:text-ink-3',
  'transition-colors duration-(--dur-fast) focus-visible:border-ink',
  'disabled:cursor-not-allowed disabled:bg-sunken',
)

// counter.chars counts characters as people see them (code points, so an emoji is one) and caps typing/pasting at
// max; without it the counter follows the native maxLength (UTF-16 units). Use chars for names (the server counts them).
export type TextInputProps = { invalid?: boolean; counter?: { max: number; chars?: boolean } } & InputHTMLAttributes<HTMLInputElement>

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { invalid, counter, className, onChange, ...rest },
  ref,
) {
  const value = typeof rest.value === 'string' ? rest.value : ''
  const length = counter?.chars ? Array.from(value).length : value.length
  const showCounter = !!counter && length >= Math.floor(counter.max * 0.8)
  const input = (
    <input
      ref={ref}
      className={cx(inputBase, 'h-12', invalid || rest['aria-invalid'] ? 'border-danger' : 'border-control-border', showCounter && 'pr-16', !counter && className)}
      aria-invalid={invalid || rest['aria-invalid'] || undefined}
      {...rest}
      onChange={counter?.chars && onChange
        ? e => {
            const chars = Array.from(e.target.value)
            if (chars.length > counter.max) e.target.value = chars.slice(0, counter.max).join('')
            onChange(e)
          }
        : onChange}
    />
  )
  if (!counter) return input
  return (
    <div className={cx('relative', className)}>
      {input}
      {showCounter && (
        <span aria-hidden className="mono-label tabular pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-3">
          {length}/{counter.max}
        </span>
      )}
    </div>
  )
})

export type TextAreaProps = { invalid?: boolean; counter?: { max: number } } & TextareaHTMLAttributes<HTMLTextAreaElement>

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { invalid, counter, className, rows = 2, ...rest },
  ref,
) {
  const length = typeof rest.value === 'string' ? rest.value.length : 0
  const showCounter = !!counter && length >= Math.floor(counter.max * 0.8)
  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={rows}
        className={cx(inputBase, 'min-h-12 resize-none py-3', invalid || rest['aria-invalid'] ? 'border-danger' : 'border-control-border', className)}
        aria-invalid={invalid || rest['aria-invalid'] || undefined}
        {...rest}
      />
      {showCounter && counter && (
        <span aria-hidden className="mono-label tabular pointer-events-none absolute right-3.5 bottom-2 text-ink-3">
          {length}/{counter.max}
        </span>
      )}
    </div>
  )
})

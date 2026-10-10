import { useRef, type ButtonHTMLAttributes, type ChangeEvent } from 'react'

interface FilePickerButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onClick'> {
  /** The kinds of file to offer, e.g. "image/*". */
  accept: string
  multiple?: boolean
  /** Called with the chosen files. Not called if the picker is cancelled. */
  onFiles(files: File[]): void
}

/** A button that opens the device's own photo or file picker. */
export default function FilePickerButton({ accept, multiple = false, onFiles, children, ...button }: FilePickerButtonProps) {
  const input = useRef<HTMLInputElement>(null)

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    // Copied first, because clearing the input empties its live FileList.
    const files = Array.from(event.target.files ?? [])
    // Cleared so that choosing the same file again still counts as a change.
    event.target.value = ''
    if (files.length > 0) onFiles(files)
  }

  return (
    <>
      <button {...button} type="button" onClick={() => input.current?.click()}>
        {children}
      </button>
      {/* Hidden from view rather than with display: none, which some mobile browsers refuse to open a picker for. */}
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept={accept}
        multiple={multiple}
        tabIndex={-1}
        aria-hidden="true"
        onChange={onChange}
      />
    </>
  )
}

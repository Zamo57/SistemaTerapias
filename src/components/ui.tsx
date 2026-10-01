import {
  useEffect,
  useRef,
  useId,
  Children,
  isValidElement,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { ArrowRight, X } from "lucide-react";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const generated = useId(),
    items = Children.toArray(children);
  const control = items.find(
    (child) =>
      isValidElement(child) &&
      typeof child.type === "string" &&
      ["input", "select", "textarea"].includes(child.type),
  ) as ReactElement<any> | undefined;
  const id = control?.props.id || generated;
  if (control)
    return (
      <div className="field">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {items.map((child) =>
          child === control ? cloneElement(control, { id }) : child,
        )}
      </div>
    );
  return (
    <div className="field" role="group" aria-labelledby={id}>
      <span id={id}>{label}</span>
      {children}
    </div>
  );
}

export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, []);
  return (
    <div className="overlay">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
      >
        <header>
          <h2>{title}</h2>
          <button onClick={close} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Metric({
  title,
  value,
  subtitle,
  onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  onClick?: () => void;
}) {
  const Element = onClick ? "button" : "div";
  return (
    <Element className="metric glass" onClick={onClick}>
      <div className="metric-label">
        {title}
        <ArrowRight size={15} />
      </div>
      <strong>{value}</strong>
      <small>{subtitle}</small>
    </Element>
  );
}

export function Empty({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

import type { ReactNode } from "react";
import type { FieldProps, StatusBadgeTone } from "../types.ts";

export const StatusBadge = ({
  tone = "neutral",
  children,
}: {
  tone?: StatusBadgeTone;
  children: ReactNode;
}) => <span className={"statusBadge " + tone}>{children}</span>;

export const Field = ({ label, help, action, children }: FieldProps) => (
  <label className="field">
    <span>
      {label}
      {help ? <small>{help}</small> : null}
      {action ? <span className="fieldAction">{action}</span> : null}
    </span>
    {children}
  </label>
);

export const LockButton = ({ locked, onToggle }: { locked: boolean; onToggle: () => void }) => (
  <button className={"lockButton " + (locked ? "locked" : "")} type="button" onClick={onToggle}>
    {locked ? "已锁定" : "锁定"}
  </button>
);

export const EmptyMini = ({ children }: { children: ReactNode }) => (
  <div className="emptyMini">{children}</div>
);

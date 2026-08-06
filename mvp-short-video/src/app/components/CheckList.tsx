import type { CheckItem, DraftAnalysis } from "../types.ts";
import { StatusBadge } from "./ui.tsx";

export const CheckListPanel = ({
  analysis,
  title = "导出前检查",
  onIssueAction,
}: {
  analysis: DraftAnalysis;
  title?: string;
  onIssueAction?: (check: CheckItem) => void;
}) => (
  <div className="checkListPanel">
    <div className="miniHeader">
      <div>
        <p className="eyebrow">审核</p>
        <h2>{title}</h2>
      </div>
      <StatusBadge
        tone={analysis.exportReady ? "success" : analysis.blockingCount > 0 ? "danger" : "warning"}
      >
        {analysis.exportReady
          ? "可导出"
          : analysis.blockingCount > 0
            ? analysis.blockingCount + " 项需处理"
            : "待审核"}
      </StatusBadge>
    </div>
    <div className="readinessGrid">
      {analysis.checks.map((check) => (
        <article className="readinessItem" key={check.label}>
          <StatusBadge tone={check.severity}>
            {check.severity === "success"
              ? "通过"
              : check.severity === "danger"
                ? "处理"
                : check.severity === "warning"
                  ? "留意"
                  : "确认"}
          </StatusBadge>
          <strong>{check.label}</strong>
          <span>{check.detail}</span>
          {check.target && check.severity !== "success" ? (
            <button
              className="linkButton issueAction"
              type="button"
              onClick={() => onIssueAction?.(check)}
            >
              去处理
            </button>
          ) : null}
        </article>
      ))}
    </div>
  </div>
);

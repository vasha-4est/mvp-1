"use client";

type ControlTowerErrorStateProps = {
  message?: string;
  onRetry?: () => void;
};

export function ControlTowerErrorState({ message, onRetry }: ControlTowerErrorStateProps) {
  return (
    <section
      role="alert"
      style={{ border: "1px solid #f2c4c4", background: "#fff4f4", borderRadius: 8, padding: 12 }}
    >
      <h2 style={{ marginTop: 0 }}>Unable to load Control Tower</h2>
      <p style={{ marginBottom: onRetry ? 12 : 0 }}>
        {message ?? "The API is not ready yet or returned an unexpected response."}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{ border: "1px solid #ccc", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
        >
          Try again
        </button>
      ) : null}
    </section>
  );
}

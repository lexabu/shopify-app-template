import { useState } from "react";

type FeedbackType = "bug" | "feature_request" | "general" | "nps";

type FeedbackWidgetProps = {
  currentPage?: string;
};

export function FeedbackWidget({ currentPage }: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("general");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError("Please enter a message");
      return;
    }

    if (type === "nps" && rating === null) {
      setError("Please select a rating");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message,
          rating: type === "nps" ? rating : undefined,
          page: currentPage,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit feedback");
      }

      setSubmitted(true);
      setMessage("");
      setRating(null);

      // Auto-close after 2 seconds
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
      }, 2000);
    } catch (err) {
      setError("Failed to submit feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <div style={{ position: "fixed", bottom: "20px", right: "20px", zIndex: 1000 }}>
        <button
          onClick={() => setIsOpen(true)}
          style={{
            backgroundColor: "#2c6ecb",
            color: "white",
            border: "none",
            borderRadius: "50%",
            width: "50px",
            height: "50px",
            cursor: "pointer",
            fontSize: "20px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
          }}
          title="Send Feedback"
        >
          💬
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        width: "350px",
        backgroundColor: "white",
        borderRadius: "8px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        zIndex: 1000,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: "#2c6ecb",
          color: "white",
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: "bold" }}>Send Feedback</span>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: "white",
            cursor: "pointer",
            fontSize: "18px",
          }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: "16px" }}>
        {submitted ? (
          <div style={{ textAlign: "center", padding: "20px" }}>
            <div style={{ fontSize: "48px", marginBottom: "10px" }}>✅</div>
            <p style={{ margin: 0, color: "#333" }}>Thank you for your feedback!</p>
          </div>
        ) : (
          <>
            {/* Type selector */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FeedbackType)}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                }}
              >
                <option value="general">General Feedback</option>
                <option value="bug">Report a Bug</option>
                <option value="feature_request">Feature Request</option>
                <option value="nps">Rate the App</option>
              </select>
            </div>

            {/* NPS Rating */}
            {type === "nps" && (
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>
                  How likely are you to recommend this app? (0-10)
                </label>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRating(n)}
                      style={{
                        width: "28px",
                        height: "28px",
                        border: rating === n ? "2px solid #2c6ecb" : "1px solid #ddd",
                        borderRadius: "4px",
                        backgroundColor: rating === n ? "#e6f0fa" : "white",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#666", marginTop: "4px" }}>
                  <span>Not likely</span>
                  <span>Very likely</span>
                </div>
              </div>
            )}

            {/* Message */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>
                {type === "bug" ? "Describe the bug" : type === "feature_request" ? "Describe your idea" : "Your feedback"}
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  type === "bug"
                    ? "What happened? What did you expect?"
                    : type === "feature_request"
                    ? "What feature would you like to see?"
                    : "Tell us what you think..."
                }
                rows={4}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{ color: "red", fontSize: "13px", marginBottom: "12px" }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                width: "100%",
                padding: "10px",
                backgroundColor: submitting ? "#ccc" : "#2c6ecb",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: submitting ? "not-allowed" : "pointer",
                fontWeight: "500",
              }}
            >
              {submitting ? "Sending..." : "Send Feedback"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

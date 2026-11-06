function QuickActionButton({ label, onClick, disabled = false }) {
  return (
    <button
      type="button"
      className="quick-action-button"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

export default QuickActionButton;

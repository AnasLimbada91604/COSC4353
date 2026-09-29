function QuickActionButton({ label, onClick }) {
  return (
    <button type="button" className="quick-action-button" onClick={onClick}>
      {label}
    </button>
  );
}

export default QuickActionButton;

interface SarapeStripeProps {
  className?: string;
}

export default function SarapeStripe({ className = "" }: SarapeStripeProps) {
  return <div className={`sarape-stripe ${className}`} aria-hidden="true" />;
}

/**
 * Answers to the company's own request fields, as a compact list under the comment.
 */
export function FieldAnswers({ fields }: { fields?: { label: string; value: string }[] }) {
  if (!fields?.length) return null;
  return (
    <dl className="field-answers">
      {fields.map((field) => (
        <div key={field.label}>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

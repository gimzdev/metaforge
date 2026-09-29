import { Fragment } from 'react';

/**
 * A comp name for serif headings: the display face's ampersand is a flourish, so
 * "Aphelios & Nidalee" gets a plain one from the text face instead.
 */
export function CompName({ name }: { name: string }) {
  const parts = name.split('&');
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="font-sans text-[0.78em] font-normal">&amp;</span>}
          {part}
        </Fragment>
      ))}
    </>
  );
}

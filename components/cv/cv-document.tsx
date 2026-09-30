import { cvView, type CvDocumentInput, type Seg, type SectionBody } from "@/lib/cv/document";

/**
 * The CV document for web pages: the same markup the PDF prints (lib/cv/document.ts builds
 * both from one view; tests/unit/cv-document.test.ts keeps them identical). React escapes
 * every value.
 */
function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((x, i) => (typeof x === "string" ? x : <span key={i} className="cv-strong">{x.strong}</span>))}
    </>
  );
}

function Body({ b }: { b: SectionBody }) {
  if (b.kind === "p") return <p>{b.text}</p>;
  if (b.kind === "list") {
    return (
      <ul>
        {b.items.map((item, i) => (
          <li key={i}>
            <Segs segs={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <>
      {b.items.map((p, i) => (
        <div key={i} className="cv-item">
          <h3>{p.title}</h3>
          <p className="cv-meta">{p.meta}</p>
          <p>{p.proof}</p>
          {p.skills ? <p>{p.skills}</p> : null}
          {p.repository ? <p>{p.repository}</p> : null}
          {p.description ? (
            <p className="cv-desc">
              <span className="cv-label">Description by the team:</span> {p.description}
            </p>
          ) : null}
        </div>
      ))}
    </>
  );
}

export function CvDocument(input: CvDocumentInput) {
  const v = cvView(input);
  return (
    <article className={`cvdoc cv-${v.template}`} lang="en">
      <header className="cv-head">
        <h1 className="cv-name">{v.name}</h1>
        <p className="cv-sub">{v.sub}</p>
        {v.standing ? <p className="cv-standing">{v.standing}</p> : null}
        <p className="cv-contact">{v.contact}</p>
      </header>
      {v.sections.map((sec) => (
        <section key={sec.key} className={`cv-sec cv-sec-${sec.key}`}>
          <h2>{sec.heading}</h2>
          <Body b={sec.body} />
        </section>
      ))}
      <footer className="cv-foot">
        <div className="cv-foot-text">
          <p>{v.issuedLine}</p>
          <p>{v.checkLine}</p>
        </div>
        {v.qrDataUri ? (
          <div className="cv-qr">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI QR code, identical to the PDF's markup */}
            <img src={v.qrDataUri} alt="" width={83} height={83} />
          </div>
        ) : null}
      </footer>
    </article>
  );
}

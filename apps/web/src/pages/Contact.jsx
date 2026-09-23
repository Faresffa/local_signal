// apps/web/src/pages/Contact.jsx

import { ArrowLeft, EnvelopeSimple } from "@phosphor-icons/react";

const EMAIL_CONTACT = "fareshafianepro@gmail.com";

export default function Contact({ onBack }) {
  return (
    <div style={{ maxWidth: "72ch" }}>
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} weight="bold" />
        Retour
      </button>

      <h1 className="detail__title">Contact</h1>

      <section className="legal__section">
        <p>
          Une question, un restaurant à signaler, un problème rencontré sur
          l'application ? Écrivez-nous.
        </p>

        <a
          href={`mailto:${EMAIL_CONTACT}`}
          className="btn btn--primary"
          style={{ marginTop: 16, display: "inline-flex" }}
        >
          <EnvelopeSimple size={17} weight="bold" />
          {EMAIL_CONTACT}
        </a>
      </section>
    </div>
  );
}

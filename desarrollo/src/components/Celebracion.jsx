import { useEffect, useRef, useState } from "react";

// El dino celebra con su espantasuegras y confeti cada vez que algo queda Listo.
const COLORES = ["#0780ee", "#4dc1ff", "#ff7c00", "#ffbe00", "#1dcd9f", "#a63be3", "#e03c31"];
const FRASES = ["¡Felicidades", "¡Bien hecho", "¡Qué chiva", "¡Excelente", "¡Pura vida"];

export default function Celebracion({ nombre }) {
  const [fiesta, setFiesta] = useState(null);
  const reloj = useRef(null);
  useEffect(() => {
    const f = (e) => {
      clearTimeout(reloj.current);
      const piezas = Array.from({ length: 46 }, (_, i) => ({
        i, x: Math.random() * 100, retraso: Math.random() * 0.6, dur: 1.6 + Math.random() * 1.4,
        color: COLORES[i % COLORES.length], giro: Math.random() * 720 - 360, ancho: 6 + Math.random() * 6, redondo: Math.random() < 0.3,
      }));
      setFiesta({ id: Date.now(), titulo: e.detail?.titulo ?? "", frase: FRASES[Math.floor(Math.random() * FRASES.length)], piezas });
      reloj.current = setTimeout(() => setFiesta(null), 3600);
    };
    window.addEventListener("celebrar", f);
    return () => { window.removeEventListener("celebrar", f); clearTimeout(reloj.current); };
  }, []);
  if (!fiesta) return null;
  return (
    <div className="celebracion" key={fiesta.id} role="status" aria-live="polite">
      <div className="confeti" aria-hidden="true">
        {fiesta.piezas.map((p) => (
          <i key={p.i} className={p.redondo ? "redondo" : ""} style={{ left: `${p.x}%`, background: p.color, width: p.ancho, height: p.redondo ? p.ancho : p.ancho * 1.8,
            animationDelay: `${p.retraso}s`, animationDuration: `${p.dur}s`, "--giro": `${p.giro}deg` }} />
        ))}
      </div>
      <div className="tarjeta-fiesta">
        <DinoFiesta />
        {/* Sin texto en pantalla: solo para lectores de pantalla */}
        <span className="solo-lector">{fiesta.frase}{nombre ? `, ${nombre}` : ""}! {fiesta.titulo ? `«${fiesta.titulo}» quedó lista` : ""}</span>
      </div>
    </div>
  );
}

function DinoFiesta() {
  return (
    <svg className="dino-fiesta" viewBox="-4 -6 154 112" width="300" height="218" aria-hidden="true">
      {/* gorrito de fiesta */}
      <g className="gorro">
        <path d="M74 14l14-14 7 20z" fill="#a63be3" />
        <path d="M78 10l6 2M82 6l7 3M86 15l7 1" stroke="#ffbe00" strokeWidth="2" strokeLinecap="round" />
        <circle cx="88" cy="0.5" r="3.2" fill="#ffbe00" />
      </g>
      {/* dino (cuerpo que rebota) */}
      <g className="cuerpo-dino">
        <path d="M27 63l-4-11 11 2zM35 53l-2-11 10 4zM46 46l1-11 9 7z" fill="#ff7c00" stroke="#ff7c00" strokeWidth="2" strokeLinejoin="round" />
        <path d="M6 77c7 1 13-1 16-6 0-14 10-25 23-29 6-2 10-7 13-13 3-6 7-10 14-10 9 0 16 6 16 14 0 6-4 10-10 10h-4c-3 0-4 1-4 4v11c0 11-7 18-17 20l-2 9h-8l-1-7h-5l-1 7h-8l-2-9c-7 4-17 4-20-1z" fill="#1dcd9f" />
        <path d="M29 72c4 4 11 6 18 3" fill="none" stroke="#098e68" strokeWidth="3" strokeLinecap="round" />
        <path className="ojo" d="M71 25q4-4 8 0" fill="none" stroke="#30343c" strokeWidth="3" strokeLinecap="round" />
        <circle cx="65" cy="33" r="3" fill="#ff9bb3" opacity=".9" />
        {/* brazito */}
        <path d="M58 56q7-2 10 3" fill="none" stroke="#098e68" strokeWidth="3.5" strokeLinecap="round" />
      </g>
      {/* espantasuegras que se estira desde la boca */}
      <g className="soplete">
        <path d="M86 35l10-3 1 6-10 2z" fill="#ff7c00" />
        <g className="lengua">
          <path d="M96 31h34c8 0 12 4 12 9s-4 8-9 8c-4 0-6-2-6-5s2-4 4-4" fill="none" stroke="#0780ee" strokeWidth="7" strokeLinecap="round" />
          <path d="M100 31h4M110 31h4M120 31h4" stroke="#ffbe00" strokeWidth="7" />
        </g>
        <circle className="nota n1" cx="118" cy="18" r="2.5" fill="#ffbe00" />
        <circle className="nota n2" cx="130" cy="12" r="2" fill="#e03c31" />
        <circle className="nota n3" cx="140" cy="22" r="2.2" fill="#4dc1ff" />
      </g>
    </svg>
  );
}

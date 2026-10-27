import { estaVencida, fechaCorta, progreso, tareasPrincipales } from "../lib/logica.js";
import { Avatar } from "./ui.jsx";
import { BarraEstados } from "./TablaVista.jsx";

export default function ResumenVista({ visibles, groups, estados, labels, perfiles, project_members, abrir }) {
  const prog = progreso(visibles, labels);
  const vencidas = visibles.filter((t) => estaVencida(t, labels));
  const atascadas = visibles.filter((t) => /atasc|stuck|bloque/i.test(labels.find((l) => l.id === t.status_id)?.name ?? ""));
  const totalEst = visibles.reduce((a, t) => a + (Number(t.estimation) || 0), 0);

  const porPersona = project_members.map((m) => ({
    perfil: perfiles[m.user_id],
    tareas: visibles.filter((t) => t.assignee_id === m.user_id),
  })).filter((x) => x.perfil);

  return (
    <div className="resumen">
      <div className="indicadores">
        <div className="indicador"><span className="tenue">Tareas</span><strong>{prog.total}</strong></div>
        <div className="indicador"><span className="tenue">Completadas</span><strong>{prog.porcentaje}%</strong></div>
        <div className="indicador"><span className="tenue">Vencidas</span><strong className={vencidas.length ? "texto-peligro" : ""}>{vencidas.length}</strong></div>
        <div className="indicador"><span className="tenue">Estimación total</span><strong>{Math.round(totalEst * 100) / 100}</strong></div>
      </div>

      <div className="paneles">
        <section className="panel-resumen">
          <h3>Avance por grupo</h3>
          {groups.map((g) => {
            const ts = tareasPrincipales(visibles).filter((t) => t.group_id === g.id);
            return (
              <div key={g.id} className="fila-resumen">
                <span className="nombre-resumen"><i className="punto" style={{ background: g.color }} /> {g.name}</span>
                {ts.length ? <BarraEstados tareas={ts} estados={estados} /> : <span className="tenue pequeno">Sin tareas</span>}
                <span className="tenue pequeno">{progreso(ts, labels).porcentaje}%</span>
              </div>
            );
          })}
          <div className="leyenda">{estados.map((e) => <span key={e.id}><i className="punto" style={{ background: e.color }} /> {e.name}</span>)}</div>
        </section>

        <section className="panel-resumen">
          <h3>Carga por persona</h3>
          {porPersona.map(({ perfil, tareas }) => (
            <div key={perfil.id} className="fila-resumen">
              <span className="nombre-resumen"><Avatar perfil={perfil} size={22} /> {perfil.full_name || perfil.username}</span>
              {tareas.length ? <BarraEstados tareas={tareas} estados={estados} /> : <span className="tenue pequeno">Sin tareas</span>}
              <span className="tenue pequeno">{tareas.length}</span>
            </div>
          ))}
        </section>

        <section className="panel-resumen">
          <h3>Requieren atención</h3>
          {![...vencidas, ...atascadas].length && <p className="tenue pequeno">Nada vencido ni atascado. 🎉</p>}
          {[...new Map([...vencidas, ...atascadas].map((t) => [t.id, t])).values()].map((t) => (
            <button key={t.id} className="fila-atencion" onClick={() => abrir(t.id)}>
              <span className="corta">{t.title}</span>
              <span className={estaVencida(t, labels) ? "texto-peligro pequeno" : "tenue pequeno"}>
                {estaVencida(t, labels) ? `Vencida ${fechaCorta(t.due_date)}` : "Atascada"}
              </span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}

"""Pruebas de permisos y reglas del esquema contra un Postgres local con stub de Supabase."""
import sys, psycopg2
DSN = sys.argv[1]
conn = psycopg2.connect(DSN); conn.autocommit = True
cur = conn.cursor()
ok = fail = 0

def as_user(uid):
    cur.execute("reset role"); 
    if uid == 'anon': cur.execute("set role anon"); cur.execute("select set_config('request.jwt.claim.sub','',false)")
    else: cur.execute("set role authenticated"); cur.execute("select set_config('request.jwt.claim.sub',%s,false)", (uid,))

def admin(): cur.execute("reset role")

def q(sql, args=()):
    cur.execute(sql, args)
    return cur.fetchall() if cur.description else None

def check(name, cond):
    global ok, fail
    if cond: ok += 1; print("  ✔", name)
    else: fail += 1; print("  ✘", name)

def must_fail(name, sql, args=()):
    try: q(sql, args); check(name + " (debía fallar)", False)
    except psycopg2.Error as e: check(name, True)

def rowcount(sql, args=()):
    q(sql, args); return cur.rowcount

admin()
uids = {}
for n in ['ana', 'beto', 'carla', 'dani']:
    uids[n] = q("insert into auth.users(email, raw_user_meta_data) values (%s, %s) returning id",
                (f"{n}@test.com", '{"username":"%s","full_name":"%s"}' % (n, n.title())))[0][0]
weird = q("insert into auth.users(email) values ('Raro+X@test.com') returning id")[0][0]
A, B, C, D = (uids[k] for k in ['ana', 'beto', 'carla', 'dani'])

print("Registro / perfiles")
check("4 perfiles + 1 con usuario derivado del correo", q("select count(*) from profiles")[0][0] == 5)
check("usuario derivado es válido", q("select username ~ '^[a-z0-9_.-]{3,30}$' from profiles where id=%s", (weird,))[0][0])
as_user('anon')
check("anon puede consultar disponibilidad de usuario", q("select username_available('ana')")[0][0] is False)
must_fail("anon no lee perfiles", "select * from profiles")
must_fail("anon no lee tareas", "select * from tasks")
must_fail("anon no usa find_profile", "select * from find_profile('ana')")

print("Proyectos")
as_user(A)
pid = q("insert into projects(name) values ('Proyecto Alpha') returning id")[0][0]
check("insert ... returning funciona para el creador", pid is not None)
check("creador queda como owner", q("select role from project_members where project_id=%s", (pid,)) == [('owner',)])
check("8 etiquetas por defecto", q("select count(*) from labels where project_id=%s", (pid,))[0][0] == 8)
gid = q("select id from groups where project_id=%s", (pid,))[0][0]
st = dict(q("select name, id from labels where project_id=%s and kind='status'", (pid,)))
pr = dict(q("select name, id from labels where project_id=%s and kind='priority'", (pid,)))
must_fail("no se puede crear proyecto a nombre de otro", "insert into projects(name, owner_id) values ('x', %s)", (B,))
must_fail("no se puede cambiar el dueño", "update projects set owner_id=%s where id=%s", (B, pid))

as_user(B)
check("Beto (no miembro) no ve el proyecto", q("select count(*) from projects")[0][0] == 0)
check("Beto no ve tareas/etiquetas", q("select count(*) from labels")[0][0] == 0)
check("Beto no ve el perfil de Ana", q("select count(*) from profiles where id=%s", (A,))[0][0] == 0)
must_fail("Beto no crea tareas en proyecto ajeno", "insert into tasks(project_id, group_id, title) values (%s,%s,'hack')", (pid, gid))
check("Beto no puede editar proyecto ajeno (0 filas)", rowcount("update projects set name='hack' where id=%s", (pid,)) == 0)
must_fail("Beto no se agrega solo como miembro", "insert into project_members(project_id,user_id,role) values (%s,%s,'editor')", (pid, B))

print("Miembros")
as_user(A)
check("find_profile encuentra por usuario exacto", q("select username from find_profile(' Beto ')") == [('beto',)])
q("insert into project_members(project_id,user_id,role) values (%s,%s,'editor'),(%s,%s,'viewer')", (pid, B, pid, C))
must_fail("no se puede agregar otro owner", "insert into project_members(project_id,user_id,role) values (%s,%s,'owner')", (pid, D))
check("dueño no puede degradarse a sí mismo (0 filas)", rowcount("update project_members set role='viewer' where project_id=%s and user_id=%s", (pid, A)) == 0)
check("dueño no puede salirse (0 filas)", rowcount("delete from project_members where project_id=%s and user_id=%s", (pid, A)) == 0)

print("Tareas / subtareas (editor)")
as_user(B)
check("Beto ya ve el proyecto", q("select count(*) from projects")[0][0] == 1)
tid = q("insert into tasks(project_id, group_id, title, status_id, priority_id, assignee_id, due_date) values (%s,%s,'Requisitos',%s,%s,%s,'2026-11-30') returning id",
        (pid, gid, st['En curso'], pr['Alta'], C))[0][0]
check("editor crea tarea con estado, prioridad, responsable y fecha", tid is not None)
sid = q("insert into tasks(project_id, parent_id, title) values (%s,%s,'Subtarea 1') returning id", (pid, tid))[0][0]
check("editor crea subtarea", sid is not None)
must_fail("no se permite sub-subtarea", "insert into tasks(project_id, parent_id, title) values (%s,%s,'nivel 3')", (pid, sid))
must_fail("responsable debe ser miembro", "update tasks set assignee_id=%s where id=%s", (D, tid))
must_fail("fecha inicio > fecha límite rechazada", "update tasks set start_date='2026-12-31' where id=%s", (tid,))
check("editor actualiza estado", rowcount("update tasks set status_id=%s where id=%s", (st['Listo'], tid)) == 1)
check("Beto (editor) no puede hacerse owner (0 filas)", rowcount("update project_members set role='owner' where project_id=%s and user_id=%s", (pid, B)) == 0)
check("editor no puede borrar el proyecto (0 filas)", rowcount("delete from projects where id=%s", (pid,)) == 0)

# Proyecto de Dani para pruebas cruzadas
as_user(D)
pid2 = q("insert into projects(name) values ('Proyecto de Dani') returning id")[0][0]
st2 = q("select id from labels where project_id=%s and kind='status' limit 1", (pid2,))[0][0]
gid2 = q("select id from groups where project_id=%s", (pid2,))[0][0]
as_user(B)
must_fail("estado de otro proyecto rechazado", "update tasks set status_id=%s where id=%s", (st2, tid))
must_fail("grupo de otro proyecto rechazado", "update tasks set group_id=%s where id=%s", (gid2, tid))

print("Comentarios (viewer)")
as_user(C)
must_fail("viewer no crea tareas", "insert into tasks(project_id, group_id, title) values (%s,%s,'x')", (pid, gid))
check("viewer no edita tareas (0 filas)", rowcount("update tasks set title='x' where id=%s", (tid,)) == 0)
cid = q("insert into comments(task_id, body) values (%s,'¡Revisado!') returning id, project_id", (tid,))[0]
check("viewer comenta y project_id se rellena solo", cid[1] == pid)
must_fail("no se comenta haciéndose pasar por otro", "insert into comments(task_id, body, author_id) values (%s,'x',%s)", (tid, A))
check("viewer ve perfiles de su equipo", q("select count(*) from profiles")[0][0] == 3)
as_user(B)
check("Beto no edita comentario ajeno (0 filas)", rowcount("update comments set body='x' where id=%s", (cid[0],)) == 0)
check("Beto no borra comentario ajeno (0 filas)", rowcount("delete from comments where id=%s", (cid[0],)) == 0)
as_user(D)
must_fail("no miembro no comenta", "insert into comments(task_id, body) values (%s,'x')", (tid,))
check("no miembro no ve comentarios", q("select count(*) from comments")[0][0] == 0)
as_user(A)
check("dueño borra comentario de otro", rowcount("delete from comments where id=%s", (cid[0],)) == 1)

print("Salida y borrado")
as_user(B)
check("editor puede salir del proyecto", rowcount("delete from project_members where project_id=%s and user_id=%s", (pid, B)) == 1)
check("tras salir ya no ve tareas", q("select count(*) from tasks")[0][0] == 0)
as_user(A)
check("borrar tarea borra sus subtareas", rowcount("delete from tasks where id=%s", (tid,)) == 1 and q("select count(*) from tasks where id=%s", (sid,))[0][0] == 0)
check("dueño borra el proyecto", rowcount("delete from projects where id=%s", (pid,)) == 1)
admin()
check("borrado en cascada (grupos/etiquetas)", q("select count(*) from labels where project_id=%s", (pid,))[0][0] == 0)
check("tablas en publicación realtime", q("select count(*) from pg_publication_tables where pubname='supabase_realtime'")[0][0] == 6)

print("Administración de usuarios")
as_user(C)
must_fail("usuario no se hace administrador", "update profiles set is_admin=true where id=%s", (C,))
must_fail("usuario no cambia su nombre de usuario", "update profiles set username='otra' where id=%s", (C,))
must_fail("usuario no se desactiva/activa solo", "update profiles set disabled=true where id=%s", (C,))
check("usuario cambia su nombre visible", rowcount("update profiles set full_name='Carla R.' where id=%s", (C,)) == 1)
admin(); q("update profiles set must_change_password=true where id=%s", (C,))
as_user(C)
check("usuario marca que ya cambió su contraseña", rowcount("update profiles set must_change_password=false where id=%s", (C,)) == 1)
must_fail("usuario no se vuelve a marcar contraseña temporal", "update profiles set must_change_password=true where id=%s", (C,))
check("usuario no edita perfil ajeno (0 filas)", rowcount("update profiles set full_name='x' where id=%s", (A,)) == 0)
as_user(A)
pid3 = q("insert into projects(name) values ('Proyecto Beta') returning id")[0][0]
q("insert into project_members(project_id,user_id,role) values (%s,%s,'editor')", (pid3, C))
as_user(C)
check("Carla ve Proyecto Beta antes de desactivarla", q("select count(*) from projects where id=%s", (pid3,))[0][0] == 1)
cur.execute("reset role"); cur.execute("set role service_role")
check("service_role (función admin) puede desactivar", rowcount("update profiles set disabled=true where id=%s", (C,)) == 1)
as_user(C)
check("usuaria desactivada pierde acceso al proyecto", q("select count(*) from projects where id=%s", (pid3,))[0][0] == 0)
must_fail("usuaria desactivada no crea proyectos", "insert into projects(name) values ('x')")
must_fail("usuaria desactivada no se reactiva sola", "update profiles set disabled=false where id=%s", (C,))
as_user(A)
check("find_profile no devuelve desactivados", q("select count(*) from find_profile('carla')")[0][0] == 0)

print(f"\nResultado: {ok} OK, {fail} fallidas")
sys.exit(1 if fail else 0)

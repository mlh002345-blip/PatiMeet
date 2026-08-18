import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth';
import { getDb, nowMs } from '../db';
import { publicDog, publicUser, type DogRow, type UserRow } from '../domain/serialize';
import { asyncRoute, badRequest, notFound, parseBody } from '../http';
import { newId } from '../ids';

export const communityRouter = Router();

communityRouter.get('/area-summary', requireAuth, asyncRoute(async (req, res) => {
  const me = currentUser(req);
  const user = await getDb().one<UserRow>('SELECT * FROM users WHERE id=$1', [me.id]);
  const district = user?.district ?? '';
  const dogs = district ? await getDb().one<any>(`SELECT COUNT(*)::int c FROM dogs d JOIN users u ON u.id=d.owner_id WHERE d.status='active' AND u.status='active' AND u.district=$1 AND u.id!=$2`, [district, me.id]) : { c: 0 };
  const events = district ? await getDb().one<any>(`SELECT COUNT(*)::int c FROM events WHERE status='active' AND starts_at>$1 AND district=$2`, [nowMs(), district]) : { c: 0 };
  const alerts = district ? await getDb().one<any>(`SELECT COUNT(*)::int c FROM lost_dog_posts WHERE status='active' AND district=$1`, [district]) : { c: 0 };
  res.json({ district, nearbyDogs: dogs?.c ?? 0, upcomingEvents: events?.c ?? 0, activeAlerts: alerts?.c ?? 0 });
}));

communityRouter.get('/lost-dogs', requireAuth, asyncRoute(async (req, res) => {
  const district = typeof req.query.district === 'string' ? req.query.district.trim() : '';
  const rows = await getDb().query<any>(
    `SELECT p.*, d.name dog_name FROM lost_dog_posts p JOIN dogs d ON d.id=p.dog_id
     WHERE p.status='active' ${district ? 'AND p.district=$1' : ''} ORDER BY p.created_at DESC LIMIT 50`,
    district ? [district] : []
  );
  const posts = await Promise.all(rows.map(async (p) => {
    const dog = await getDb().one<DogRow>('SELECT * FROM dogs WHERE id=$1', [p.dog_id]);
    const owner = await getDb().one<UserRow>('SELECT * FROM users WHERE id=$1', [p.owner_id]);
    return { id:p.id, district:p.district, lastSeenArea:p.last_seen_area, details:p.details,
      status:p.status, createdAt:p.created_at, isOwner:p.owner_id===currentUser(req).id,
      dog: dog ? await publicDog(dog) : null, owner: owner ? await publicUser(owner) : null };
  }));
  res.json({ posts });
}));

communityRouter.post('/lost-dogs', requireAuth, asyncRoute(async (req, res) => {
  const me=currentUser(req); const input=parseBody(z.object({
    dogId:z.string().min(1), district:z.string().trim().min(2).max(80),
    lastSeenArea:z.string().trim().min(3).max(120), details:z.string().trim().max(600).optional()
  }), req.body);
  const dog=await getDb().one<DogRow>('SELECT * FROM dogs WHERE id=$1 AND owner_id=$2 AND status=\'active\'', [input.dogId,me.id]);
  if(!dog) throw badRequest('Köpek profili bulunamadı.','dog_not_found');
  const id=newId(), ts=nowMs();
  await getDb().exec(`INSERT INTO lost_dog_posts(id,owner_id,dog_id,district,last_seen_area,details,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$7)`,[id,me.id,input.dogId,input.district,input.lastSeenArea,input.details??'',ts]);
  res.status(201).json({ok:true,id,message:'Kayıp ilanı yayınlandı.'});
}));

communityRouter.post('/lost-dogs/:id/found', requireAuth, asyncRoute(async(req,res)=>{
  const result=await getDb().exec(`UPDATE lost_dog_posts SET status='found',updated_at=$1 WHERE id=$2 AND owner_id=$3`,[nowMs(),req.params.id,currentUser(req).id]);
  if(!result.rowCount) throw notFound('İlan bulunamadı.');
  res.json({ok:true,message:'İlan bulundu olarak kapatıldı.'});
}));

communityRouter.post('/events/:id/review', requireAuth, asyncRoute(async(req,res)=>{
  const me=currentUser(req); const input=parseBody(z.object({rating:z.number().int().min(1).max(5),feltSafe:z.boolean(),comment:z.string().trim().max(400).optional()}),req.body);
  const event=await getDb().one<any>('SELECT * FROM events WHERE id=$1',[req.params.id]);
  if(!event) throw notFound('Etkinlik bulunamadı.');
  if(event.starts_at>nowMs()) throw badRequest('Etkinlik bitmeden değerlendirme yapılamaz.','event_not_finished');
  const joined=await getDb().one<any>('SELECT id FROM event_participants WHERE event_id=$1 AND user_id=$2',[event.id,me.id]);
  if(!joined) throw badRequest('Yalnızca katıldığınız etkinliği değerlendirebilirsiniz.','not_participant');
  await getDb().exec(`INSERT INTO event_reviews(id,event_id,reviewer_id,rating,felt_safe,comment,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_id,reviewer_id) DO UPDATE SET rating=EXCLUDED.rating,felt_safe=EXCLUDED.felt_safe,comment=EXCLUDED.comment`,
    [newId(),event.id,me.id,input.rating,input.feltSafe,input.comment??'',nowMs()]);
  res.status(201).json({ok:true,message:'Değerlendirmen kaydedildi.'});
}));

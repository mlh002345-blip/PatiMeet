import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../src/api';
import { AppText, Banner, Button, Card, ChoiceGroup, Field, LoadingState, ScrollScreen, SectionHeader, Tag } from '../src/components/ui';
import { useSession } from '../src/session';
import { useLoader } from '../src/useLoader';
import { colors, radius, spacing } from '../src/theme';

export default function CommunityScreen(){
  const router=useRouter();
  const {user}=useSession(); const [area,setArea]=useState(''); const [details,setDetails]=useState('');
  const [dogId,setDogId]=useState<string|null>(user?.dogs[0]?.id??null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState<string|null>(null);
  const loader=useLoader(async()=>{const [lost,summary,history]=await Promise.all([api.lostDogs(),api.areaSummary(),api.events({scope:'history'})]);return {posts:lost.posts,summary,history:history.events};},[]);
  async function publish(){ if(!dogId||!user?.district||area.trim().length<3){setMessage('Köpek, semt ve son görülen bölge gerekli.');return;} setBusy(true);setMessage(null);try{const r=await api.createLostDog({dogId,district:user.district,lastSeenArea:area,details});setArea('');setDetails('');setMessage(r.message);loader.refresh();}catch(e){setMessage(e instanceof ApiError?e.message:'İlan yayınlanamadı.');}finally{setBusy(false);} }
  return <ScrollScreen refreshing={loader.refreshing} onRefresh={loader.refresh}>
    <AppText variant="display">Güvenli Topluluk</AppText>
    <AppText color={colors.textMuted} style={{marginTop:spacing.xs}}>Tam konum paylaşmadan yakın çevrendeki gelişmeleri gör.</AppText>
    <SectionHeader title="Yaklaşık bölge haritası" />
    <Card><View style={styles.map}><View style={[styles.zone,{left:'12%',top:35,width:120,height:90}]} /><View style={[styles.zone,{right:'8%',top:75,width:145,height:110,opacity:.55}]} /><View style={styles.pin}><AppText variant="title">🐾</AppText></View></View>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm}}><Tag label={`📍 ${user?.district??'Semtin'} çevresi`} tone="primary" /><Tag label={`${loader.data?.summary.nearbyDogs??0} köpek`} tone="success"/><Tag label={`${loader.data?.summary.upcomingEvents??0} etkinlik`} tone="accent"/><Tag label={`${loader.data?.summary.activeAlerts??0} kayıp ilanı`} tone="danger"/></View>
      <AppText variant="caption" color={colors.textMuted} style={{marginTop:spacing.sm}}>İşaretler gerçek adres veya anlık konum değildir. Güvenlik için yalnızca yaklaşık bölge gösterilir.</AppText>
    </Card>
    <SectionHeader title="Kayıp köpek ilanı ver" />
    {message?<Banner tone={message.includes('gerekli')||message.includes('madı')?'error':'success'} message={message}/>:null}
    <Card>{(user?.dogs.length??0)>1?<ChoiceGroup label="Köpeğin" value={dogId} onChange={setDogId} options={(user?.dogs??[]).map(d=>({value:d.id,label:d.name}))}/>:null}
      <Field label="Son görülen yaklaşık bölge" value={area} onChangeText={setArea} placeholder="Örn. Moda Parkı çevresi" required />
      <Field label="Açıklama" value={details} onChangeText={setDetails} placeholder="Tasma, renk veya ayırt edici özellik" multiline maxLength={600}/>
      <Button label="Kayıp ilanını yayınla" onPress={publish} loading={busy}/>
    </Card>
    <SectionHeader title="Aktif kayıp ilanları" />
    {loader.loading?<LoadingState/>:(loader.data?.posts??[]).map(p=><Card key={p.id} style={{marginBottom:spacing.md}}><View style={{flexDirection:'row',gap:spacing.md}}>{p.dog?.photoUrl?<Image source={{uri:p.dog.photoUrl}} style={styles.photo}/>:null}<View style={{flex:1}}><AppText variant="heading">{p.dog?.name??'Kayıp köpek'}</AppText><AppText color={colors.textMuted}>{p.lastSeenArea} · {p.district}</AppText></View><Tag label="KAYIP" tone="danger"/></View>{p.details?<AppText style={{marginTop:spacing.md}}>{p.details}</AppText>:null}{p.isOwner?<Button label="Bulundu olarak kapat" variant="secondary" style={{marginTop:spacing.md}} onPress={async()=>{await api.markDogFound(p.id);loader.refresh();}}/>:p.owner?<Button label="Sahibine mesaj gönder" variant="secondary" style={{marginTop:spacing.md}} onPress={async()=>{const r=await api.openConversation(p.owner!.id);router.push(`/chat/${r.conversation.id}`);}}/>:null}</Card>)}
    <SectionHeader title="Etkinlik sonrası güvenlik" />
    <Card><AppText variant="heading">Katıldığın etkinliği değerlendir</AppText><AppText color={colors.textMuted} style={{marginTop:spacing.sm}}>Etkinlik bittikten sonra 1–5 yıldız, “güvende hissettim” bilgisi ve isteğe bağlı yorum gönderebilirsin. Ciddi durumlarda mevcut şikâyet sistemi moderasyona iletir.</AppText></Card>
    {(loader.data?.history??[]).map(event=><Card key={event.id} style={{marginTop:spacing.md}}><AppText variant="bodyStrong">{event.title}</AppText><AppText variant="caption" color={colors.textMuted}>{event.district}</AppText><Button label="Değerlendir" variant="secondary" style={{marginTop:spacing.md}} onPress={()=>router.push(`/event/${event.id}`)}/></Card>)}
  </ScrollScreen>
}
const styles=StyleSheet.create({map:{height:210,borderRadius:radius.lg,backgroundColor:'#E8E1D7',overflow:'hidden',marginBottom:spacing.md},zone:{position:'absolute',borderRadius:80,backgroundColor:colors.primaryLight,borderWidth:2,borderColor:colors.primary},pin:{position:'absolute',left:'47%',top:78,width:54,height:54,borderRadius:27,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'},photo:{width:64,height:64,borderRadius:radius.md,backgroundColor:colors.surfaceMuted}});

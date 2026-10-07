import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
const money=value=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));
const CUSTOMER_PORTAL_URL="https://agendamento.c7barbeariatradicional.com.br/";

let services=[];
let professionals=[];
let selectedServiceIds=new Set();
let selectedProfessional="";
let availableSlots=[];
let selectedSlot=null;
let accountMode="login";
let portalAppointments=[];
let rescheduleTarget=null;
let rescheduleSlots=[];
let rescheduleSelectedSlot=null;

function formatPhone(value){
  const digits=value.replace(/\D/g,"").slice(0,11);
  if(digits.length<=2) return digits;
  if(digits.length<=7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
  if(digits.length<=10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
}

function setStepIndicator(step){
  document.querySelectorAll("[data-step-indicator]").forEach(el=>{
    const current=Number(el.dataset.stepIndicator);
    el.classList.toggle("active",current===step);
    el.classList.toggle("done",current<step);
  });
}

function showOnly(panelId){
  ["customerIdentityForm","identifiedState","servicesStep","professionalStep","scheduleStep","confirmationStep","customerPortalStep"].forEach(id=>{
    $(id)?.classList.add("hidden");
  });
  $(panelId)?.classList.remove("hidden");
}

function groupByCategory(items){
  return items.reduce((acc,item)=>{
    const key=(item.category||"Outros").trim()||"Outros";
    (acc[key] ||= []).push(item);
    return acc;
  },{});
}

function selectedServices(){
  return services.filter(item=>selectedServiceIds.has(String(item.id)));
}

function updateServiceSummary(){
  const selected=selectedServices();
  const totalDuration=selected.reduce((sum,item)=>sum+Number(item.duration_minutes||0),0);
  const totalPrice=selected.reduce((sum,item)=>sum+Number(item.price||0),0);

  $("serviceCountSummary").textContent=selected.length===1?"1 selecionado":`${selected.length} selecionados`;
  $("serviceDurationSummary").textContent=`${totalDuration} min`;
  $("servicePriceSummary").textContent=money(totalPrice);
  $("continueToProfessionalBtn").disabled=!selected.length;

  sessionStorage.setItem("c7_booking_service_ids",JSON.stringify([...selectedServiceIds]));
  sessionStorage.setItem("c7_booking_duration_minutes",String(totalDuration));
  sessionStorage.setItem("c7_booking_total_price",String(totalPrice));
}

function renderServices(){
  const target=$("servicesList");
  target.replaceChildren();

  if(!services.length){
    target.innerHTML='<div class="loading-state">Nenhum serviço disponível no momento.</div>';
    return;
  }

  const groups=groupByCategory(services);

  Object.entries(groups).forEach(([category,items])=>{
    const section=document.createElement("section");
    section.className="service-category";

    const head=document.createElement("div");
    head.className="service-category-head";
    const title=document.createElement("h3");
    title.textContent=category;
    const count=document.createElement("span");
    count.textContent=`${items.length} ${items.length===1?"opção":"opções"}`;
    head.append(title,count);

    const grid=document.createElement("div");
    grid.className="service-grid";

    items.forEach(item=>{
      const selected=selectedServiceIds.has(String(item.id));
      const button=document.createElement("button");
      button.type="button";
      button.className="service-card"+(selected?" selected":"");
      button.dataset.serviceId=String(item.id);

      const top=document.createElement("div");
      top.className="service-card-top";

      const info=document.createElement("div");
      const name=document.createElement("strong");
      name.textContent=item.name;
      const duration=document.createElement("span");
      duration.textContent=item.duration||`${item.duration_minutes||0} min`;
      info.append(name,duration);

      const check=document.createElement("span");
      check.className="service-check";
      check.textContent=selected?"✓":"+";

      top.append(info,check);

      const price=document.createElement("strong");
      price.className="service-price";
      price.textContent=money(item.price);

      button.append(top,price);

      button.addEventListener("click",()=>{
        const id=String(item.id);
        if(selectedServiceIds.has(id)) selectedServiceIds.delete(id);
        else selectedServiceIds.add(id);
        renderServices();
        updateServiceSummary();
      });

      grid.appendChild(button);
    });

    section.append(head,grid);
    target.appendChild(section);
  });

  updateServiceSummary();
}

async function loadServices(){
  $("servicesList").innerHTML='<div class="loading-state">Carregando serviços...</div>';
  const {data,error}=await supabase.rpc("get_booking_services");

  if(error){
    $("servicesList").innerHTML='<div class="loading-state error">Não foi possível carregar os serviços.</div>';
    return false;
  }

  services=data||[];

  const saved=JSON.parse(sessionStorage.getItem("c7_booking_service_ids")||"[]");
  selectedServiceIds=new Set(saved.map(String).filter(id=>services.some(s=>String(s.id)===id)));

  renderServices();
  return true;
}

function renderProfessionals(){
  const target=$("professionalList");
  target.replaceChildren();

  const anyCard=document.createElement("button");
  anyCard.type="button";
  anyCard.className="professional-card any"+(selectedProfessional==="any"?" selected":"");
  anyCard.innerHTML=`
    <div class="professional-avatar any-avatar">C7</div>
    <div class="professional-info">
      <strong>Qualquer profissional disponível</strong>
      <span>Mostraremos o primeiro horário disponível entre todos os barbeiros.</span>
    </div>
    <div class="professional-select">${selectedProfessional==="any"?"✓":"→"}</div>
  `;
  anyCard.addEventListener("click",()=>{
    selectedProfessional="any";
    sessionStorage.setItem("c7_booking_professional_id","any");
    renderProfessionals();
    updateProfessionalSummary();
  });
  target.appendChild(anyCard);

  professionals.forEach(pro=>{
    const selected=selectedProfessional===pro.id;
    const card=document.createElement("button");
    card.type="button";
    card.className="professional-card"+(selected?" selected":"");

    const avatar=document.createElement("div");
    avatar.className="professional-avatar";
    if(pro.avatar_url){
      const img=document.createElement("img");
      img.src=pro.avatar_url;
      img.alt=pro.full_name;
      avatar.appendChild(img);
    }else{
      avatar.textContent=(pro.full_name||"C").slice(0,1).toUpperCase();
    }

    const info=document.createElement("div");
    info.className="professional-info";
    const name=document.createElement("strong");
    name.textContent=pro.full_name;
    const specialty=document.createElement("span");
    specialty.textContent=pro.specialty||"Barbeiro";
    info.append(name,specialty);

    const action=document.createElement("div");
    action.className="professional-select";
    action.textContent=selected?"✓":"→";

    card.append(avatar,info,action);

    card.addEventListener("click",()=>{
      selectedProfessional=pro.id;
      sessionStorage.setItem("c7_booking_professional_id",pro.id);
      renderProfessionals();
      updateProfessionalSummary();
    });

    target.appendChild(card);
  });
}

function updateProfessionalSummary(){
  const selected=selectedServices();
  const serviceNames=selected.map(item=>item.name).join(" + ");
  $("professionalServiceSummary").textContent=serviceNames||"—";

  const pro=professionals.find(item=>item.id===selectedProfessional);
  $("professionalChoiceSummary").textContent=
    selectedProfessional==="any"?"Qualquer disponível":
    pro?.full_name||"Ainda não escolhido";

  $("continueToScheduleBtn").disabled=!selectedProfessional;
}

async function loadProfessionals(){
  $("professionalList").innerHTML='<div class="loading-state">Carregando profissionais...</div>';
  const {data,error}=await supabase.rpc("get_booking_professionals");

  if(error){
    $("professionalList").innerHTML='<div class="loading-state error">Não foi possível carregar os profissionais.</div>';
    return false;
  }

  professionals=data||[];

  const saved=sessionStorage.getItem("c7_booking_professional_id")||"";
  selectedProfessional=(saved==="any"||professionals.some(p=>p.id===saved))?saved:"";

  renderProfessionals();
  updateProfessionalSummary();
  return true;
}

async function goToServices(){
  showOnly("servicesStep");
  setStepIndicator(2);
  await loadServices();
}

async function goToProfessionals(){
  if(!selectedServiceIds.size){
    $("servicesMessage").textContent="Selecione pelo menos um serviço.";
    return;
  }

  $("servicesMessage").textContent="";
  showOnly("professionalStep");
  setStepIndicator(3);
  await loadProfessionals();
}


function localDateInput(date){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,"0");
  const d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function formatDatePt(value){
  if(!value) return "—";
  return new Date(value+"T12:00:00").toLocaleDateString("pt-BR",{
    weekday:"short",day:"2-digit",month:"2-digit"
  });
}

function formatTimePt(value){
  return new Date(value).toLocaleTimeString("pt-BR",{
    hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"
  });
}

function bookingDurationMinutes(){
  return selectedServices().reduce((sum,item)=>sum+Number(item.duration_minutes||0),0);
}

function toIcsDate(date){
  const pad=n=>String(n).padStart(2,"0");
  return date.getUTCFullYear()+
    pad(date.getUTCMonth()+1)+
    pad(date.getUTCDate())+"T"+
    pad(date.getUTCHours())+
    pad(date.getUTCMinutes())+
    pad(date.getUTCSeconds())+"Z";
}

function downloadCalendarEvent(){
  if(!selectedSlot) return;

  const starts=new Date(selectedSlot.starts_at);
  const ends=new Date(starts.getTime()+bookingDurationMinutes()*60000);
  const serviceNames=selectedServices().map(item=>item.name).join(" + ");
  const title=`C7 Barbearia — ${serviceNames}`;
  const description=`Agendamento com ${selectedSlot.professional_name} na C7 Barbearia Tradicional.`;

  const content=[
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//C7 Barbearia//Agendamento//PT-BR",
    "BEGIN:VEVENT",
    `UID:${sessionStorage.getItem("c7_booking_appointment_id")||Date.now()}@c7barbearia`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(starts)}`,
    `DTEND:${toIcsDate(ends)}`,
    `SUMMARY:${title.replace(/\n/g," ")}`,
    `DESCRIPTION:${description.replace(/\n/g," ")}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  const blob=new Blob([content],{type:"text/calendar;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="agendamento-c7.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openBookingWhatsApp(){
  if(!selectedSlot) return;

  const name=sessionStorage.getItem("c7_booking_customer_name")||"Cliente";
  const date=$("bookingDate").value;
  const time=formatTimePt(selectedSlot.starts_at);
  const servicesText=selectedServices().map(item=>item.name).join(" + ");
  const message=[
    `Olá! Sou ${name}.`,
    "Acabei de fazer um agendamento pelo site da C7.",
    `Data: ${formatDatePt(date)} às ${time}`,
    `Profissional: ${selectedSlot.professional_name}`,
    `Serviços: ${servicesText}`
  ].join("\n");

  window.open(
    `https://wa.me/5562992390887?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer"
  );
}

function renderSlots(){
  const target=$("slotsList");
  target.replaceChildren();

  if(!availableSlots.length){
    target.innerHTML='<div class="loading-state">Nenhum horário disponível nesta data.</div>';
    return;
  }

  const groups={manha:[],tarde:[],noite:[]};
  availableSlots.forEach(slot=>{
    const hour=Number(formatTimePt(slot.starts_at).slice(0,2));
    if(hour<12) groups.manha.push(slot);
    else if(hour<18) groups.tarde.push(slot);
    else groups.noite.push(slot);
  });

  const labels={manha:"Manhã",tarde:"Tarde",noite:"Noite"};

  Object.entries(groups).forEach(([key,items])=>{
    if(!items.length) return;

    const section=document.createElement("section");
    section.className="slot-period";

    const title=document.createElement("h3");
    title.textContent=labels[key];

    const grid=document.createElement("div");
    grid.className="slot-grid";

    items.forEach(slot=>{
      const active=selectedSlot?.starts_at===slot.starts_at &&
        selectedSlot?.professional_id===slot.professional_id;

      const btn=document.createElement("button");
      btn.type="button";
      btn.className="slot-btn"+(active?" selected":"");

      const time=document.createElement("strong");
      time.textContent=formatTimePt(slot.starts_at);
      btn.appendChild(time);

      if(selectedProfessional==="any"){
        const pro=document.createElement("span");
        pro.textContent=slot.professional_name;
        btn.appendChild(pro);
      }

      btn.addEventListener("click",()=>{
        selectedSlot=slot;
        renderSlots();
        updateScheduleSummary();
      });

      grid.appendChild(btn);
    });

    section.append(title,grid);
    target.appendChild(section);
  });
}

function updateScheduleSummary(){
  const totalPrice=selectedServices().reduce((sum,item)=>sum+Number(item.price||0),0);
  $("scheduleDateSummary").textContent=formatDatePt($("bookingDate").value);
  $("scheduleTimeSummary").textContent=selectedSlot?formatTimePt(selectedSlot.starts_at):"—";
  $("schedulePriceSummary").textContent=money(totalPrice);
  $("confirmBookingBtn").disabled=!selectedSlot;
}

async function loadSlots(){
  const date=$("bookingDate").value;
  selectedSlot=null;
  updateScheduleSummary();

  if(!date){
    $("slotsList").innerHTML='<div class="loading-state">Escolha uma data para ver os horários.</div>';
    return;
  }

  $("slotsList").innerHTML='<div class="loading-state">Buscando horários disponíveis...</div>';
  $("scheduleMessage").textContent="";

  const serviceIds=[...selectedServiceIds].map(Number);
  const professionalId=selectedProfessional==="any"?null:selectedProfessional;

  const {data,error}=await supabase.rpc("get_booking_slots",{
    p_date:date,
    p_service_ids:serviceIds,
    p_professional_id:professionalId
  });

  if(error){
    $("slotsList").innerHTML='<div class="loading-state error">Não foi possível carregar os horários.</div>';
    return;
  }

  availableSlots=data||[];
  renderSlots();
}

async function goToSchedule(){
  if(!selectedProfessional){
    $("professionalMessage").textContent="Escolha um profissional ou a opção de qualquer disponível.";
    return;
  }

  $("professionalMessage").textContent="";
  showOnly("scheduleStep");
  setStepIndicator(4);

  const professionalName=selectedProfessional==="any"
    ?"Qualquer disponível"
    :(professionals.find(p=>p.id===selectedProfessional)?.full_name||"Profissional");

  sessionStorage.setItem("c7_booking_professional_name",professionalName);
  $("selectedBookingProfessional").querySelector("strong").textContent=professionalName;

  const today=new Date();
  const maxDate=new Date();
  maxDate.setDate(maxDate.getDate()+30);

  $("bookingDate").min=localDateInput(today);
  $("bookingDate").max=localDateInput(maxDate);

  if(!$("bookingDate").value){
    $("bookingDate").value=localDateInput(today);
  }

  updateScheduleSummary();
  await loadSlots();
}

async function confirmBooking(){
  if(!selectedSlot) return;

  const customerId=sessionStorage.getItem("c7_booking_customer_id");
  if(!customerId){
    $("scheduleMessage").textContent="Seu cadastro expirou. Volte para a identificação.";
    return;
  }

  $("confirmBookingBtn").disabled=true;
  $("scheduleMessage").textContent="Confirmando seu horário...";

  const {data,error}=await supabase.rpc("create_public_booking",{
    p_customer_id:customerId,
    p_professional_id:selectedSlot.professional_id,
    p_service_ids:[...selectedServiceIds].map(Number),
    p_starts_at:selectedSlot.starts_at
  });

  if(error){
    const message=String(error.message||"");
    $("confirmBookingBtn").disabled=false;
    $("scheduleMessage").textContent=
      message.includes("não está mais disponível")?"Esse horário acabou de ser ocupado. Escolha outro.":
      message.includes("bloqueado")?"Esse horário não está mais disponível.":
      "Não foi possível confirmar agora. Tente novamente.";
    await loadSlots();
    return;
  }

  sessionStorage.setItem("c7_booking_appointment_id",data);

  const serviceNames=selectedServices().map(item=>item.name).join(" + ");
  const customerName=sessionStorage.getItem("c7_booking_customer_name")||"Cliente";

  $("confirmationTitle").textContent=`Pronto, ${customerName.split(" ")[0]}.`;
  $("confirmationText").textContent="Seu horário já entrou na agenda da C7.";
  $("confirmationDate").textContent=formatDatePt($("bookingDate").value);
  $("confirmationTime").textContent=formatTimePt(selectedSlot.starts_at);
  $("confirmationProfessional").textContent=selectedSlot.professional_name;
  $("confirmationServices").textContent=serviceNames;
  $("confirmationDuration").textContent=`${bookingDurationMinutes()} min`;
  $("confirmationTotal").textContent=money(
    selectedServices().reduce((sum,item)=>sum+Number(item.price||0),0)
  );

  showOnly("confirmationStep");
  document.querySelectorAll("[data-step-indicator]").forEach(el=>{
    el.classList.remove("active");
    el.classList.add("done");
  });
}


$("customerPhone")?.addEventListener("input",e=>{
  e.target.value=formatPhone(e.target.value);
});

$("showOptionalBtn")?.addEventListener("click",()=>{
  $("optionalFields").classList.toggle("hidden");
  $("showOptionalBtn").textContent=$("optionalFields").classList.contains("hidden")
    ? "+ ADICIONAR E-MAIL E ANIVERSÁRIO"
    : "− OCULTAR CAMPOS OPCIONAIS";
});

$("customerIdentityForm")?.addEventListener("submit",async e=>{
  e.preventDefault();

  const name=$("customerName").value.trim();
  const phone=$("customerPhone").value.trim();
  const email=$("customerEmail").value.trim();
  const birthDate=$("customerBirthDate").value||null;

  if(name.length<2){
    $("identityMessage").textContent="Informe seu nome.";
    return;
  }

  if(phone.replace(/\D/g,"").length<10){
    $("identityMessage").textContent="Informe um WhatsApp válido.";
    return;
  }

  $("continueBtn").disabled=true;
  $("identityMessage").textContent="Identificando seu cadastro...";

  const {data,error}=await supabase.rpc("resolve_booking_customer",{
    p_full_name:name,
    p_phone:phone,
    p_email:email||null,
    p_birth_date:birthDate,
    p_marketing_opt_in:$("marketingOptIn").checked
  });

  $("continueBtn").disabled=false;

  if(error){
    const message=String(error.message||"");
    $("identityMessage").textContent=
      message.includes("WhatsApp inválido")?"Confira seu número de WhatsApp.":
      message.includes("Nome inválido")?"Confira seu nome.":
      "Não foi possível continuar agora. Tente novamente.";
    return;
  }

  sessionStorage.setItem("c7_booking_customer_id",data);
  sessionStorage.setItem("c7_booking_customer_name",name);
  sessionStorage.setItem("c7_booking_customer_phone",phone);
  sessionStorage.setItem("c7_booking_customer_email",email);

  showOnly("identifiedState");
  $("identifiedName").textContent=`Tudo certo, ${name.split(" ")[0]}.`;
});

$("nextStepBtn")?.addEventListener("click",goToServices);

$("backToIdentityBtn")?.addEventListener("click",()=>{
  showOnly("customerIdentityForm");
  setStepIndicator(1);
});

$("continueToProfessionalBtn")?.addEventListener("click",goToProfessionals);

$("backToServicesBtn")?.addEventListener("click",()=>{
  showOnly("servicesStep");
  setStepIndicator(2);
  renderServices();
});

$("continueToScheduleBtn")?.addEventListener("click",goToSchedule);

$("backToProfessionalBtn")?.addEventListener("click",()=>{
  showOnly("professionalStep");
  setStepIndicator(3);
  renderProfessionals();
  updateProfessionalSummary();
});

$("bookingDate")?.addEventListener("change",loadSlots);
$("confirmBookingBtn")?.addEventListener("click",confirmBooking);

$("calendarBtn")?.addEventListener("click",downloadCalendarEvent);
$("whatsappBtn")?.addEventListener("click",openBookingWhatsApp);

function setAccountMode(mode){
  accountMode=mode;
  const creating=mode==="create";
  $("accountLoginTab").classList.toggle("active",!creating);
  $("accountCreateTab").classList.toggle("active",creating);
  $("accountModalTitle").textContent=creating?"Criar minha área":"Entrar";
  $("accountSubmitBtn").firstChild.textContent=creating?"CRIAR CONTA ":"ENTRAR ";
  $("accountPassword").autocomplete=creating?"new-password":"current-password";
  $("accountMessage").textContent="";

  const savedEmail=sessionStorage.getItem("c7_booking_customer_email")||"";
  if(creating&&savedEmail) $("accountEmail").value=savedEmail;
}

function openAccountModal(mode="login"){
  $("customerAccountModal").classList.remove("hidden");
  setAccountMode(mode);
}

function closeAccountModal(){
  $("customerAccountModal").classList.add("hidden");
  $("accountMessage").textContent="";
}

function portalAppointmentRow(item,interactive=false){
  const date=new Date(item.starts_at);
  const dateLabel=date.toLocaleDateString("pt-BR",{
    day:"2-digit",month:"2-digit",year:"numeric",timeZone:"America/Sao_Paulo"
  });
  const timeLabel=date.toLocaleTimeString("pt-BR",{
    hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"
  });

  const statusLabels={
    scheduled:"Agendado",
    confirmed:"Confirmado",
    waiting:"Aguardando",
    in_service:"Em atendimento",
    completed:"Concluído",
    cancelled:"Cancelado",
    no_show:"Não compareceu"
  };

  const canManage=interactive&&["scheduled","confirmed"].includes(item.status)&&date>new Date();

  return `
    <article class="portal-appointment">
      <div class="portal-appointment-main">
        <span>${dateLabel} • ${timeLabel}</span>
        <strong>${item.services||"Atendimento"}</strong>
        <small>${item.professional_name||"C7"} • ${statusLabels[item.status]||item.status}</small>
        ${canManage?`
          <div class="portal-appointment-actions">
            <button type="button" data-reschedule-appointment="${item.id}">REAGENDAR</button>
            <button type="button" class="danger" data-cancel-appointment="${item.id}">CANCELAR</button>
          </div>
        `:""}
      </div>
      <strong>${money(item.total_amount)}</strong>
    </article>
  `;
}

async function loadCustomerPortal(){
  const [
    {data:profile,error:profileError},
    {data:appointments,error:appointmentError},
    {data:benefits,error:benefitsError},
    {data:preferences,error:preferencesError}
  ]=await Promise.all([
    supabase.rpc("get_my_customer_profile"),
    supabase.rpc("get_my_appointments"),
    supabase.rpc("get_my_benefits"),
    supabase.rpc("get_my_consumption_preferences")
  ]);

  if(profileError||!profile?.length){
    openAccountModal("login");
    $("accountMessage").textContent="Não encontramos uma Área C7 vinculada a esta conta.";
    return false;
  }

  const customer=profile[0];
  const rows=appointments||[];
  portalAppointments=rows;

  sessionStorage.setItem("c7_booking_customer_id",customer.id);
  sessionStorage.setItem("c7_booking_customer_name",customer.full_name||"Cliente");
  sessionStorage.setItem("c7_booking_customer_phone",customer.phone||"");
  sessionStorage.setItem("c7_booking_customer_email",customer.email||"");

  $("portalWelcome").textContent=`Olá, ${(customer.full_name||"Cliente").split(" ")[0]}.`;
  $("portalProfile").innerHTML=`
    <div><span>CLIENTE</span><strong>${customer.full_name||"—"}</strong></div>
    <div><span>WHATSAPP</span><strong>${customer.phone||"—"}</strong></div>
    <div><span>E-MAIL</span><strong>${customer.email||"—"}</strong></div>
    <div><span>BARBEIRO PREFERIDO</span><strong>${customer.preferred_professional_name||"Ainda não definido"}</strong></div>
  `;

  const benefitRows=benefits||[];
  if($("portalBenefitsList")){
    if(benefitsError){
      $("portalBenefitsList").innerHTML='<div class="loading-state error">Não foi possível carregar seus benefícios.</div>';
    }else if(!benefitRows.length){
      $("portalBenefitsList").innerHTML='<div class="loading-state">Nenhum benefício ativo no momento.</div>';
    }else{
      $("portalBenefitsList").innerHTML=benefitRows.map(item=>{
        const discount=item.discount_type==="percent"
          ?`${Number(item.discount_value||0).toLocaleString("pt-BR")}% OFF`
          :money(item.discount_value);

        const valid=item.valid_until
          ?`Válido até ${new Date(item.valid_until+"T12:00:00").toLocaleDateString("pt-BR")}`
          :"Benefício ativo";

        return `
          <article class="benefit-card">
            <div>
              <span>${item.benefit_type==="birthday"?"ANIVERSÁRIO":"PLANO ATIVO"}</span>
              <strong>${item.title||"Benefício C7"}</strong>
              <small>${item.description||valid}</small>
            </div>
            <div class="benefit-value">${discount}</div>
            <em>${valid}</em>
          </article>
        `;
      }).join("");
    }
  }


  const preferenceRows=preferences||[];
  const topByGroup=group=>preferenceRows.find(item=>item.item_group===group);

  const setPreference=(group,nameId,metaId)=>{
    const item=topByGroup(group);
    $(nameId).textContent=item?.item_name||"—";
    $(metaId).textContent=item
      ?`${Number(item.quantity||0).toLocaleString("pt-BR")}x • ${money(item.total_amount)}`
      :(preferencesError?"Não foi possível carregar":"Sem histórico ainda");
  };

  setPreference("service","portalFavoriteService","portalFavoriteServiceMeta");
  setPreference("product","portalFavoriteProduct","portalFavoriteProductMeta");
  setPreference("convenience","portalFavoriteConvenience","portalFavoriteConvenienceMeta");

  const now=new Date();
  const upcoming=rows.filter(item=>
    new Date(item.starts_at)>=now &&
    ["scheduled","confirmed","waiting","in_service"].includes(item.status)
  );
  const history=rows.filter(item=>!upcoming.some(next=>next.id===item.id));

  $("portalUpcomingList").innerHTML=upcoming.length
    ?upcoming.map(item=>portalAppointmentRow(item,true)).join("")
    :'<div class="loading-state">Nenhum próximo agendamento.</div>';

  $("portalHistoryList").innerHTML=history.length
    ?history.slice(0,20).map(portalAppointmentRow).join("")
    :'<div class="loading-state">Seu histórico aparecerá aqui.</div>';

  if(appointmentError){
    $("portalHistoryList").innerHTML='<div class="loading-state error">Não foi possível carregar o histórico.</div>';
  }

  bindPortalAppointmentActions();
  closeAccountModal();
  showOnly("customerPortalStep");
  document.querySelectorAll("[data-step-indicator]").forEach(el=>{
    el.classList.remove("active","done");
  });
  return true;
}


function closeRescheduleModal(){
  $("rescheduleModal")?.classList.add("hidden");
  rescheduleTarget=null;
  rescheduleSlots=[];
  rescheduleSelectedSlot=null;
}

function renderRescheduleSlots(){
  const target=$("rescheduleSlots");
  target.replaceChildren();

  if(!rescheduleSlots.length){
    target.innerHTML='<div class="loading-state">Nenhum horário disponível nesta data.</div>';
    $("confirmRescheduleBtn").disabled=true;
    return;
  }

  const grid=document.createElement("div");
  grid.className="slot-grid";

  rescheduleSlots.forEach(slot=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="slot-btn"+(
      rescheduleSelectedSlot?.starts_at===slot.starts_at?" selected":""
    );

    const strong=document.createElement("strong");
    strong.textContent=formatTimePt(slot.starts_at);
    btn.appendChild(strong);

    btn.addEventListener("click",()=>{
      rescheduleSelectedSlot=slot;
      renderRescheduleSlots();
      $("confirmRescheduleBtn").disabled=false;
    });

    grid.appendChild(btn);
  });

  target.appendChild(grid);
}

async function loadRescheduleSlots(){
  if(!rescheduleTarget) return;

  const date=$("rescheduleDate").value;
  rescheduleSelectedSlot=null;
  $("confirmRescheduleBtn").disabled=true;

  if(!date){
    $("rescheduleSlots").innerHTML='<div class="loading-state">Escolha uma data.</div>';
    return;
  }

  $("rescheduleSlots").innerHTML='<div class="loading-state">Buscando horários...</div>';
  $("rescheduleMessage").textContent="";

  const {data,error}=await supabase.rpc("get_my_reschedule_slots",{
    p_appointment_id:rescheduleTarget.id,
    p_date:date
  });

  if(error){
    $("rescheduleSlots").innerHTML='<div class="loading-state error">Não foi possível carregar os horários.</div>';
    return;
  }

  rescheduleSlots=data||[];
  renderRescheduleSlots();
}

async function openRescheduleModal(item){
  rescheduleTarget=item;
  rescheduleSlots=[];
  rescheduleSelectedSlot=null;

  $("rescheduleServiceName").textContent=item.services||"Atendimento";
  $("rescheduleProfessionalName").textContent=item.professional_name||"C7";
  $("rescheduleMessage").textContent="";
  $("confirmRescheduleBtn").disabled=true;

  const today=new Date();
  const max=new Date();
  max.setDate(max.getDate()+30);

  $("rescheduleDate").min=localDateInput(today);
  $("rescheduleDate").max=localDateInput(max);
  $("rescheduleDate").value=localDateInput(new Date(item.starts_at));

  $("rescheduleModal").classList.remove("hidden");
  await loadRescheduleSlots();
}

async function cancelPortalAppointment(item){
  const date=new Date(item.starts_at).toLocaleString("pt-BR",{
    day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",
    timeZone:"America/Sao_Paulo"
  });

  if(!confirm(`Cancelar o agendamento de ${date}?\n${item.services||"Atendimento"}`)) return;

  const {error}=await supabase.rpc("cancel_my_appointment",{
    p_appointment_id:item.id
  });

  if(error){
    alert("Não foi possível cancelar este agendamento.");
    return;
  }

  await loadCustomerPortal();
}

function bindPortalAppointmentActions(){
  document.querySelectorAll("[data-reschedule-appointment]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const item=portalAppointments.find(x=>x.id===btn.dataset.rescheduleAppointment);
      if(item) openRescheduleModal(item);
    });
  });

  document.querySelectorAll("[data-cancel-appointment]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const item=portalAppointments.find(x=>x.id===btn.dataset.cancelAppointment);
      if(item) cancelPortalAppointment(item);
    });
  });
}

document.querySelectorAll("[data-close-reschedule]").forEach(el=>{
  el.addEventListener("click",closeRescheduleModal);
});

$("rescheduleDate")?.addEventListener("change",loadRescheduleSlots);

$("confirmRescheduleBtn")?.addEventListener("click",async()=>{
  if(!rescheduleTarget||!rescheduleSelectedSlot) return;

  $("confirmRescheduleBtn").disabled=true;
  $("rescheduleMessage").textContent="Salvando novo horário...";

  const {error}=await supabase.rpc("reschedule_my_appointment",{
    p_appointment_id:rescheduleTarget.id,
    p_starts_at:rescheduleSelectedSlot.starts_at
  });

  if(error){
    const message=String(error.message||"");
    $("rescheduleMessage").textContent=
      message.includes("não está mais disponível")
        ?"Esse horário acabou de ser ocupado. Escolha outro."
        :"Não foi possível reagendar.";
    await loadRescheduleSlots();
    return;
  }

  closeRescheduleModal();
  await loadCustomerPortal();
});

async function linkPendingCustomer(){
  const pending=localStorage.getItem("c7_pending_customer_link") ||
    sessionStorage.getItem("c7_booking_customer_id");

  if(!pending) return true;

  const {error}=await supabase.rpc("link_current_user_to_customer",{
    p_customer_id:pending
  });

  if(error){
    const message=String(error.message||"");
    if(message.includes("já possui uma conta")){
      localStorage.removeItem("c7_pending_customer_link");
      return true;
    }
    return false;
  }

  localStorage.removeItem("c7_pending_customer_link");
  return true;
}


function closeProfileSettings(){
  $("profileSettingsModal")?.classList.add("hidden");
  $("profileSettingsMessage").textContent="";
}

async function openProfileSettings(){
  const {data,error}=await supabase.rpc("get_my_account_details");

  if(error||!data?.length){
    alert("Não foi possível carregar seus dados.");
    return;
  }

  const profile=data[0];
  $("profileFullName").value=profile.full_name||"";
  $("profilePhone").value=profile.phone||"";
  $("profileBirthDate").value=profile.birth_date||"";
  $("profileMarketingOptIn").checked=Boolean(profile.marketing_opt_in);
  $("profileEmail").value=profile.email||"";
  $("profileSettingsMessage").textContent="";
  $("profileSettingsModal").classList.remove("hidden");
}

function closePasswordModal(){
  $("passwordModal")?.classList.add("hidden");
  $("passwordMessage").textContent="";
  $("passwordForm")?.reset();
}

function openPasswordModal(){
  $("passwordMessage").textContent="";
  $("passwordForm")?.reset();
  $("passwordModal").classList.remove("hidden");
}

$("profilePhone")?.addEventListener("input",e=>{
  e.target.value=formatPhone(e.target.value);
});

$("editProfileBtn")?.addEventListener("click",openProfileSettings);
$("changePasswordBtn")?.addEventListener("click",openPasswordModal);

document.querySelectorAll("[data-close-profile-settings]").forEach(el=>{
  el.addEventListener("click",closeProfileSettings);
});

document.querySelectorAll("[data-close-password-modal]").forEach(el=>{
  el.addEventListener("click",closePasswordModal);
});

$("profileSettingsForm")?.addEventListener("submit",async e=>{
  e.preventDefault();

  const name=$("profileFullName").value.trim();
  const phone=$("profilePhone").value.trim();
  const birthDate=$("profileBirthDate").value||null;

  if(name.length<2){
    $("profileSettingsMessage").textContent="Informe seu nome.";
    return;
  }

  if(phone.replace(/\D/g,"").length<10){
    $("profileSettingsMessage").textContent="Informe um WhatsApp válido.";
    return;
  }

  $("profileSettingsMessage").textContent="Salvando alterações...";

  const {error}=await supabase.rpc("update_my_customer_profile",{
    p_full_name:name,
    p_phone:phone,
    p_birth_date:birthDate,
    p_marketing_opt_in:$("profileMarketingOptIn").checked
  });

  if(error){
    const message=String(error.message||"");
    $("profileSettingsMessage").textContent=
      message.includes("já está vinculado")
        ?"Este WhatsApp já está vinculado a outro cliente."
        :message.includes("WhatsApp inválido")
          ?"Informe um WhatsApp válido."
          :"Não foi possível salvar seus dados.";
    return;
  }

  sessionStorage.setItem("c7_booking_customer_name",name);
  sessionStorage.setItem("c7_booking_customer_phone",phone);
  closeProfileSettings();
  await loadCustomerPortal();
});

$("passwordForm")?.addEventListener("submit",async e=>{
  e.preventDefault();

  const password=$("newPassword").value;
  const confirmPassword=$("confirmNewPassword").value;

  if(password.length<8){
    $("passwordMessage").textContent="A senha precisa ter pelo menos 8 caracteres.";
    return;
  }

  if(password!==confirmPassword){
    $("passwordMessage").textContent="As senhas não coincidem.";
    return;
  }

  $("passwordMessage").textContent="Atualizando sua senha...";

  const {error}=await supabase.auth.updateUser({password});

  if(error){
    $("passwordMessage").textContent="Não foi possível atualizar sua senha.";
    return;
  }

  $("passwordMessage").textContent="Senha atualizada com sucesso.";
  setTimeout(closePasswordModal,700);
});

$("forgotPasswordBtn")?.addEventListener("click",async()=>{
  const email=$("accountEmail").value.trim().toLowerCase();

  if(!email){
    $("accountMessage").textContent="Informe seu e-mail para recuperar a senha.";
    return;
  }

  $("accountMessage").textContent="Enviando e-mail de recuperação...";

  const {error}=await supabase.auth.resetPasswordForEmail(email,{
    redirectTo:CUSTOMER_PORTAL_URL
  });

  $("accountMessage").textContent=error
    ?"Não foi possível enviar a recuperação de senha."
    :"Enviamos um link para redefinir sua senha.";
});

supabase.auth.onAuthStateChange(async(event)=>{
  if(event==="PASSWORD_RECOVERY"){
    closeAccountModal();
    openPasswordModal();
  }
});

async function openPortalOrLogin(){
  const {data:{session}}=await supabase.auth.getSession();
  if(session){
    const loaded=await loadCustomerPortal();
    if(loaded) return;
  }
  openAccountModal("login");
}

$("openCustomerAreaBtn")?.addEventListener("click",openPortalOrLogin);
$("createCustomerAreaBtn")?.addEventListener("click",()=>openAccountModal("create"));
$("accountLoginTab")?.addEventListener("click",()=>setAccountMode("login"));
$("accountCreateTab")?.addEventListener("click",()=>setAccountMode("create"));

document.querySelectorAll("[data-close-customer-account]").forEach(el=>{
  el.addEventListener("click",closeAccountModal);
});

$("customerAccountForm")?.addEventListener("submit",async e=>{
  e.preventDefault();

  const email=$("accountEmail").value.trim().toLowerCase();
  const password=$("accountPassword").value;

  if(password.length<8){
    $("accountMessage").textContent="A senha precisa ter pelo menos 8 caracteres.";
    return;
  }

  $("accountSubmitBtn").disabled=true;
  $("accountMessage").textContent=accountMode==="create"
    ?"Criando sua Área C7..."
    :"Entrando...";

  if(accountMode==="create"){
    const customerId=sessionStorage.getItem("c7_booking_customer_id");
    const appointmentId=sessionStorage.getItem("c7_booking_appointment_id");

    if(!customerId||!appointmentId){
      $("accountSubmitBtn").disabled=false;
      $("accountMessage").textContent="Para criar sua conta agora, finalize primeiro um agendamento.";
      return;
    }

    const {error:prepareError}=await supabase.rpc("prepare_customer_portal_email",{
      p_customer_id:customerId,
      p_appointment_id:appointmentId,
      p_email:email
    });

    if(prepareError){
      $("accountSubmitBtn").disabled=false;
      $("accountMessage").textContent=String(prepareError.message||"").includes("outro e-mail")
        ?"Este cliente já possui outro e-mail cadastrado."
        :"Não foi possível preparar sua conta.";
      return;
    }

    localStorage.setItem("c7_pending_customer_link",customerId);

    const {data,error}=await supabase.auth.signUp({
      email,
      password,
      options:{
        data:{account_type:"customer"},
        emailRedirectTo:CUSTOMER_PORTAL_URL
      }
    });

    if(error){
      $("accountSubmitBtn").disabled=false;
      $("accountMessage").textContent=String(error.message||"").toLowerCase().includes("already")
        ?"Este e-mail já possui uma conta. Use Entrar."
        :"Não foi possível criar a conta.";
      return;
    }

    if(data.session){
      const linked=await linkPendingCustomer();
      $("accountSubmitBtn").disabled=false;
      if(linked) await loadCustomerPortal();
      else $("accountMessage").textContent="Conta criada, mas não foi possível vinculá-la ao cliente.";
      return;
    }

    $("accountSubmitBtn").disabled=false;
    $("accountMessage").textContent="Conta criada. Confirme o e-mail recebido e depois entre na sua Área C7.";
    setAccountMode("login");
    $("accountEmail").value=email;
    return;
  }

  const {error}=await supabase.auth.signInWithPassword({email,password});

  if(error){
    $("accountSubmitBtn").disabled=false;
    $("accountMessage").textContent="E-mail ou senha incorretos.";
    return;
  }

  const linked=await linkPendingCustomer();
  $("accountSubmitBtn").disabled=false;

  if(!linked){
    $("accountMessage").textContent="Entramos na conta, mas ela não corresponde ao cliente deste agendamento.";
    return;
  }

  await loadCustomerPortal();
});

$("backFromPortalBtn")?.addEventListener("click",()=>{
  const name=sessionStorage.getItem("c7_booking_customer_name");
  if(name){
    showOnly("identifiedState");
    $("identifiedName").textContent=`Tudo certo, ${name.split(" ")[0]}.`;
    setStepIndicator(1);
  }else{
    showOnly("customerIdentityForm");
    setStepIndicator(1);
  }
});

$("portalNewBookingBtn")?.addEventListener("click",async()=>{
  selectedServiceIds=new Set();
  selectedProfessional="";
  selectedSlot=null;
  availableSlots=[];
  sessionStorage.removeItem("c7_booking_service_ids");
  sessionStorage.removeItem("c7_booking_professional_id");
  sessionStorage.removeItem("c7_booking_professional_name");
  sessionStorage.removeItem("c7_booking_appointment_id");
  await goToServices();
});

$("portalLogoutBtn")?.addEventListener("click",async()=>{
  await supabase.auth.signOut();
  showOnly("customerIdentityForm");
  setStepIndicator(1);
});


$("newBookingBtn")?.addEventListener("click",async()=>{
  selectedServiceIds=new Set();
  selectedProfessional="";
  selectedSlot=null;
  availableSlots=[];
  sessionStorage.removeItem("c7_booking_service_ids");
  sessionStorage.removeItem("c7_booking_professional_id");
  sessionStorage.removeItem("c7_booking_professional_name");
  sessionStorage.removeItem("c7_booking_appointment_id");
  await goToServices();
});

(function restoreIdentity(){
  const customerId=sessionStorage.getItem("c7_booking_customer_id");
  const name=sessionStorage.getItem("c7_booking_customer_name");

  if(customerId&&name){
    showOnly("identifiedState");
    $("identifiedName").textContent=`Tudo certo, ${name.split(" ")[0]}.`;
  }else{
    showOnly("customerIdentityForm");
  }
  setStepIndicator(1);
})();
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
const money=value=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));

let services=[];
let professionals=[];
let selectedServiceIds=new Set();
let selectedProfessional="";

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
  ["customerIdentityForm","identifiedState","servicesStep","professionalStep"].forEach(id=>{
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

$("continueToScheduleBtn")?.addEventListener("click",()=>{
  if(!selectedProfessional){
    $("professionalMessage").textContent="Escolha um profissional ou a opção de qualquer disponível.";
    return;
  }

  $("professionalMessage").textContent="";
  setStepIndicator(4);

  const professionalName=selectedProfessional==="any"
    ?"Qualquer profissional disponível"
    :(professionals.find(p=>p.id===selectedProfessional)?.full_name||"Profissional");

  sessionStorage.setItem("c7_booking_professional_name",professionalName);

  alert("Próxima etapa: data e horários disponíveis. Vamos montar agora.");
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
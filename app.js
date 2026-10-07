import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);

function formatPhone(value){
  const digits=value.replace(/\D/g,"").slice(0,11);
  if(digits.length<=2) return digits;
  if(digits.length<=7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
  if(digits.length<=10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
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

  $("customerIdentityForm").classList.add("hidden");
  $("identifiedName").textContent=`Tudo certo, ${name.split(" ")[0]}.`;
  $("identifiedState").classList.remove("hidden");
});

$("nextStepBtn")?.addEventListener("click",()=>{
  $("identifiedState").classList.add("hidden");
  $("identityMessage").textContent="";
  alert("Próxima etapa: escolha dos serviços. Vamos montar agora.");
});
import React from "react";
import { createRoot } from "react-dom/client";
import { PatientForm } from "../../src/components/PatientForms";
// Arnés local: nunca llama a Supabase ni al proveedor.
createRoot(document.getElementById("root")!).render(
  <PatientForm
    initial=""
    allowExternal
    close={() => {}}
    save={async () => true}
    onExisting={() => {
      document.getElementById("opened")!.textContent = "Ficha abierta";
    }}
    lookup={async (cedula) => {
      const response = await fetch("/mock-cedula/" + cedula);
      return response.json();
    }}
  />,
);

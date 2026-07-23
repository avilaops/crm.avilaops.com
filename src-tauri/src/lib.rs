use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Contact {
  id: String,
  name: String,
  email: String,
  phone: String,
  company: String,
  role: String,
  category: String,
  notes: String,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct ContactInput {
  id: Option<String>,
  name: String,
  email: String,
  phone: String,
  company: String,
  role: String,
  category: String,
  notes: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct WhatsAppSettings {
  provider_name: String,
  client_id: String,
  authorization_url: String,
  redirect_uri: String,
  scope: String,
  connected: bool,
  connected_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
  imported: usize,
  skipped: usize,
  contacts: Vec<Contact>,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|error| format!("Não foi possível localizar os dados do app: {error}"))?;
  fs::create_dir_all(&dir)
    .map_err(|error| format!("Não foi possível criar a pasta de dados: {error}"))?;
  Ok(dir)
}

fn contacts_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(data_dir(app)?.join("contacts.json"))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(data_dir(app)?.join("whatsapp_settings.json"))
}

fn read_contacts(app: &AppHandle) -> Result<Vec<Contact>, String> {
  let path = contacts_path(app)?;
  if !path.exists() {
    return Ok(Vec::new());
  }

  let content =
    fs::read_to_string(path).map_err(|error| format!("Não foi possível ler contatos: {error}"))?;
  serde_json::from_str(&content).map_err(|error| format!("Arquivo de contatos inválido: {error}"))
}

fn write_contacts(app: &AppHandle, contacts: &[Contact]) -> Result<(), String> {
  let path = contacts_path(app)?;
  let content = serde_json::to_string_pretty(contacts)
    .map_err(|error| format!("Não foi possível serializar contatos: {error}"))?;
  fs::write(path, content).map_err(|error| format!("Não foi possível salvar contatos: {error}"))
}

fn validate_contact(input: &ContactInput) -> Result<(), String> {
  if input.name.trim().len() < 2 {
    return Err("Informe um nome com pelo menos 2 caracteres.".into());
  }

  if !input.email.trim().is_empty() && (!input.email.contains('@') || !input.email.contains('.')) {
    return Err("Informe um email válido.".into());
  }

  Ok(())
}

fn normalize_phone(value: &str) -> String {
  value.chars().filter(|character| character.is_ascii_digit()).collect()
}

fn unfold_vcard_lines(content: &str) -> Vec<String> {
  let mut lines: Vec<String> = Vec::new();

  for raw_line in content.lines() {
    let line = raw_line.trim_end_matches('\r');
    if line.starts_with(' ') || line.starts_with('\t') {
      if let Some(previous) = lines.last_mut() {
        previous.push_str(line.trim_start());
      }
    } else {
      lines.push(line.to_string());
    }
  }

  lines
}

fn vcard_key_value(line: &str) -> Option<(String, String)> {
  let (key, value) = line.split_once(':')?;
  let normalized_key = key
    .split(';')
    .next()
    .unwrap_or_default()
    .trim()
    .to_uppercase();
  Some((normalized_key, decode_vcard_value(value)))
}

fn decode_vcard_value(value: &str) -> String {
  value
    .replace("\\n", "\n")
    .replace("\\N", "\n")
    .replace("\\,", ",")
    .replace("\\;", ";")
    .replace("\\\\", "\\")
    .trim()
    .to_string()
}

fn name_from_structured(value: &str) -> String {
  let parts: Vec<&str> = value.split(';').collect();
  let family = parts.first().unwrap_or(&"").trim();
  let given = parts.get(1).unwrap_or(&"").trim();
  let name = format!("{given} {family}").trim().to_string();

  if name.is_empty() {
    value.replace(';', " ").trim().to_string()
  } else {
    name
  }
}

fn parse_vcards(content: &str) -> Vec<ContactInput> {
  let mut cards = Vec::new();
  let mut current: Option<ContactInput> = None;

  for line in unfold_vcard_lines(content) {
    let upper = line.trim().to_uppercase();
    if upper == "BEGIN:VCARD" {
      current = Some(ContactInput {
        category: "Importado".into(),
        ..Default::default()
      });
      continue;
    }

    if upper == "END:VCARD" {
      if let Some(card) = current.take() {
        cards.push(card);
      }
      continue;
    }

    let Some(card) = current.as_mut() else {
      continue;
    };
    let Some((key, value)) = vcard_key_value(&line) else {
      continue;
    };

    match key.as_str() {
      "FN" if card.name.is_empty() => card.name = value,
      "N" if card.name.is_empty() => card.name = name_from_structured(&value),
      "EMAIL" if card.email.is_empty() => card.email = value,
      "TEL" if card.phone.is_empty() => card.phone = value,
      "ORG" if card.company.is_empty() => card.company = value.replace(';', " "),
      "TITLE" if card.role.is_empty() => card.role = value,
      "NOTE" if card.notes.is_empty() => card.notes = value,
      _ => {}
    }
  }

  cards
}

#[tauri::command]
fn list_contacts(app: AppHandle) -> Result<Vec<Contact>, String> {
  let mut contacts = read_contacts(&app)?;
  contacts.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  Ok(contacts)
}

#[tauri::command]
fn save_contact(app: AppHandle, input: ContactInput) -> Result<Contact, String> {
  validate_contact(&input)?;

  let mut contacts = read_contacts(&app)?;
  let now = Utc::now().to_rfc3339();
  let id = input
    .id
    .clone()
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| format!("contact-{}", Utc::now().timestamp_millis()));

  let mut contact = Contact {
    id: id.clone(),
    name: input.name.trim().to_string(),
    email: input.email.trim().to_lowercase(),
    phone: input.phone.trim().to_string(),
    company: input.company.trim().to_string(),
    role: input.role.trim().to_string(),
    category: input.category.trim().to_string(),
    notes: input.notes.trim().to_string(),
    created_at: now.clone(),
    updated_at: now.clone(),
  };

  if let Some(existing) = contacts.iter_mut().find(|item| item.id == id) {
    contact.created_at = existing.created_at.clone();
    *existing = contact.clone();
  } else {
    contacts.push(contact.clone());
  }

  write_contacts(&app, &contacts)?;
  Ok(contact)
}

#[tauri::command]
fn delete_contact(app: AppHandle, id: String) -> Result<(), String> {
  let mut contacts = read_contacts(&app)?;
  let original_len = contacts.len();
  contacts.retain(|contact| contact.id != id);

  if contacts.len() == original_len {
    return Err("Contato não encontrado.".into());
  }

  write_contacts(&app, &contacts)
}

#[tauri::command]
fn import_vcf(app: AppHandle, path: String) -> Result<ImportResult, String> {
  let content =
    fs::read_to_string(path).map_err(|error| format!("Não foi possível ler o arquivo VCF: {error}"))?;
  let mut contacts = read_contacts(&app)?;
  let mut known_emails = contacts
    .iter()
    .map(|contact| contact.email.trim().to_lowercase())
    .filter(|email| !email.is_empty())
    .collect::<HashSet<_>>();
  let mut known_phones = contacts
    .iter()
    .map(|contact| normalize_phone(&contact.phone))
    .filter(|phone| !phone.is_empty())
    .collect::<HashSet<_>>();
  let mut imported = 0;
  let mut skipped = 0;

  for input in parse_vcards(&content) {
    if input.name.trim().is_empty()
      || (input.email.trim().is_empty() && input.phone.trim().is_empty())
    {
      skipped += 1;
      continue;
    }

    let email = input.email.trim().to_lowercase();
    let phone = normalize_phone(&input.phone);

    if (!email.is_empty() && known_emails.contains(&email))
      || (!phone.is_empty() && known_phones.contains(&phone))
    {
      skipped += 1;
      continue;
    }

    let now = Utc::now().to_rfc3339();
    contacts.push(Contact {
      id: format!("contact-{}", Utc::now().timestamp_nanos_opt().unwrap_or_default()),
      name: input.name.trim().to_string(),
      email: email.clone(),
      phone: input.phone.trim().to_string(),
      company: input.company.trim().to_string(),
      role: input.role.trim().to_string(),
      category: input.category.trim().to_string(),
      notes: input.notes.trim().to_string(),
      created_at: now.clone(),
      updated_at: now,
    });
    if !email.is_empty() {
      known_emails.insert(email);
    }
    if !phone.is_empty() {
      known_phones.insert(phone);
    }
    imported += 1;
  }

  contacts.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  write_contacts(&app, &contacts)?;

  Ok(ImportResult {
    imported,
    skipped,
    contacts,
  })
}

#[tauri::command]
fn get_whatsapp_settings(app: AppHandle) -> Result<WhatsAppSettings, String> {
  let path = settings_path(&app)?;
  if !path.exists() {
    return Ok(WhatsAppSettings {
      provider_name: "Provedor OAuth2".into(),
      redirect_uri: "http://localhost:1420/auth/whatsapp/callback".into(),
      scope: "whatsapp_business_messaging whatsapp_business_management".into(),
      ..Default::default()
    });
  }

  let content = fs::read_to_string(path)
    .map_err(|error| format!("Não foi possível ler configuração OAuth2: {error}"))?;
  serde_json::from_str(&content).map_err(|error| format!("Configuração OAuth2 inválida: {error}"))
}

#[tauri::command]
fn save_whatsapp_settings(
  app: AppHandle,
  settings: WhatsAppSettings,
) -> Result<WhatsAppSettings, String> {
  let content = serde_json::to_string_pretty(&settings)
    .map_err(|error| format!("Não foi possível serializar configuração OAuth2: {error}"))?;
  fs::write(settings_path(&app)?, content)
    .map_err(|error| format!("Não foi possível salvar configuração OAuth2: {error}"))?;
  Ok(settings)
}

#[tauri::command]
fn mark_whatsapp_connected(app: AppHandle) -> Result<WhatsAppSettings, String> {
  let mut settings = get_whatsapp_settings(app.clone())?;
  settings.connected = true;
  settings.connected_at = Some(Utc::now().to_rfc3339());
  save_whatsapp_settings(app, settings)
}

#[tauri::command]
fn build_whatsapp_oauth_url(app: AppHandle) -> Result<String, String> {
  let settings = get_whatsapp_settings(app)?;
  if settings.authorization_url.trim().is_empty() || settings.client_id.trim().is_empty() {
    return Err("Configure a URL de autorização e o Client ID do provedor.".into());
  }

  let separator = if settings.authorization_url.contains('?') {
    "&"
  } else {
    "?"
  };

  Ok(format!(
    "{}{}client_id={}&redirect_uri={}&response_type=code&scope={}",
    settings.authorization_url.trim(),
    separator,
    settings.client_id.trim(),
    settings.redirect_uri.trim(),
    settings.scope.trim().replace(' ', "%20")
  ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      list_contacts,
      save_contact,
      delete_contact,
      get_whatsapp_settings,
      save_whatsapp_settings,
      mark_whatsapp_connected,
      build_whatsapp_oauth_url,
      import_vcf
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

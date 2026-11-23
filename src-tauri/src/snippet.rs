//! Textos prontos: cola um modelo de texto no app que estava em uso, com variáveis
//! trocadas na hora ({data}, {hora}, {clipboard}...). A área de transferência anterior volta
//! depois de colar (opcional), e nada disso entra no histórico nem no Win+V.

use std::time::Duration;

/// Tamanho máximo do texto (caracteres), igual à validação da interface.
pub const MAX_CHARS: usize = 10_000;
/// Espera antes de devolver a área de transferência (o app precisa ler o Ctrl+V antes).
const RESTORE_AFTER: Duration = Duration::from_millis(600);

/// Troca `{nome}` pelo valor de `var(nome)`; nome desconhecido fica como está.
/// `{{` e `}}` viram chaves literais.
pub fn expand(template: &str, var: impl Fn(&str) -> Option<String>) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(i) = rest.find(['{', '}']) {
        out.push_str(&rest[..i]);
        let tail = &rest[i..];
        if tail.starts_with("{{") || tail.starts_with("}}") {
            out.push_str(&tail[..1]);
            rest = &tail[2..];
            continue;
        }
        if tail.starts_with('{') {
            if let Some(end) = tail.find('}') {
                let name = &tail[1..end];
                if let Some(v) = (!name.contains('{')).then(|| var(&name.trim().to_lowercase())).flatten() {
                    out.push_str(&v);
                    rest = &tail[end + 1..];
                    continue;
                }
            }
        }
        out.push_str(&tail[..1]);
        rest = &tail[1..];
    }
    out.push_str(rest);
    out
}

/// Data/hora no formato do Windows do usuário (curto).
fn local_format(date: bool, long: bool) -> String {
    use windows::core::PCWSTR;
    use windows::Win32::Globalization::{GetDateFormatEx, GetTimeFormatEx, DATE_LONGDATE, DATE_SHORTDATE, TIME_NOSECONDS};
    let mut buf = [0u16; 128];
    let n = unsafe {
        if date {
            GetDateFormatEx(PCWSTR::null(), if long { DATE_LONGDATE } else { DATE_SHORTDATE }, None, PCWSTR::null(), Some(&mut buf), PCWSTR::null())
        } else {
            GetTimeFormatEx(PCWSTR::null(), TIME_NOSECONDS, None, PCWSTR::null(), Some(&mut buf))
        }
    };
    if n <= 1 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..(n - 1) as usize])
}

/// Valor das variáveis (nomes em português e inglês).
pub fn system_var(name: &str) -> Option<String> {
    match name {
        "data" | "date" => Some(local_format(true, false)),
        "datalonga" | "longdate" => Some(local_format(true, true)),
        "hora" | "time" => Some(local_format(false, false)),
        "datahora" | "datetime" => Some(format!("{} {}", local_format(true, false), local_format(false, false))),
        "clipboard" | "areadetransferencia" => Some(crate::clipboard::read_text().unwrap_or_default()),
        _ => None,
    }
}

/// Texto final (variáveis trocadas) ou o motivo de recusa. Não toca em nada do sistema
/// além de ler as variáveis.
pub fn prepare(template: &str, var: impl Fn(&str) -> Option<String>) -> Result<String, String> {
    if template.chars().count() > MAX_CHARS {
        return Err(trf!("texto grande demais (máx. {MAX_CHARS} caracteres)", "text too long (max {MAX_CHARS} characters)"));
    }
    let text = expand(template, var);
    if text.is_empty() {
        return Err(tr!("o texto ficou vazio", "the text is empty").into());
    }
    Ok(text)
}

/// Cola o texto pronto no app anterior (o foco já voltou para ele antes de chamar).
pub fn paste(template: &str, restore: bool) -> Result<(), String> {
    let text = prepare(template, system_var)?;
    if crate::qa::ENABLED {
        // Kira de teste: nunca mexe na área de transferência nem no teclado do usuário.
        crate::perf::log("rust", &format!("Kira de teste: texto pronto expandido: {text}"));
        return Ok(());
    }
    let previous = if restore { crate::clipboard::read_text() } else { None };
    crate::clipboard::write_text_private(&text)?;
    crate::actions::send_paste()?;
    if let Some(prev) = previous {
        std::thread::spawn(move || {
            std::thread::sleep(RESTORE_AFTER);
            let _ = crate::clipboard::write_text_private(&prev);
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(n: &str) -> Option<String> {
        match n {
            "data" | "date" => Some("23/11/2026".into()),
            "nome" => Some("Ana".into()),
            _ => None,
        }
    }

    #[test]
    fn troca_variaveis_e_deixa_o_resto() {
        assert_eq!(expand("Olá {nome}, hoje é {data}.", vars), "Olá Ana, hoje é 23/11/2026.");
        assert_eq!(expand("{ Data } e {DATE}", vars), "23/11/2026 e 23/11/2026");
        assert_eq!(expand("{x} fica", vars), "{x} fica");
        assert_eq!(expand("json: {{\"a\": 1}}", vars), "json: {\"a\": 1}");
        assert_eq!(expand("sem fim {data", vars), "sem fim {data");
        assert_eq!(expand("} sozinho {", vars), "} sozinho {");
        assert_eq!(expand("{{data}}", vars), "{data}");
        assert_eq!(expand("{a{data}", vars), "{a23/11/2026");
        assert_eq!(expand("ação ✓ {nome}", vars), "ação ✓ Ana");
        assert_eq!(expand("", vars), "");
    }

    #[test]
    fn variaveis_do_sistema() {
        let d = system_var("data").unwrap();
        assert!(d.chars().any(|c| c.is_ascii_digit()), "{d}");
        assert_eq!(system_var("data"), system_var("date"));
        assert!(!system_var("hora").unwrap().is_empty());
        assert!(system_var("datahora").unwrap().contains(' '));
        assert!(system_var("nada").is_none());
    }

    #[test]
    fn texto_grande_ou_vazio_e_recusado() {
        // Só a parte pura: os testes nunca colam nada de verdade.
        assert!(prepare(&"x".repeat(MAX_CHARS + 1), vars).is_err());
        assert!(prepare("", vars).is_err());
        assert_eq!(prepare("{nome}", vars).unwrap(), "Ana");
    }
}

//! Perfis por horário e por monitor ("Quando usar"): dias da semana, faixa de horário
//! (pode cruzar a meia-noite) e monitores. Tudo puro e testável; o "agora" vem de `Context`.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct When {
    /// 0 = domingo … 6 = sábado. Vazio = qualquer dia.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub days: Vec<u8>,
    /// "HH:MM" (início, inclusivo). Precisa de `to` junto.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    /// "HH:MM" (fim, exclusivo). `from` > `to` = cruza a meia-noite (ex.: 22:00–02:00).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    /// Monitores (nome de dispositivo do Windows, ex.: "\\.\DISPLAY2"). Vazio = qualquer.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub monitors: Vec<String>,
}

/// O momento e o lugar em que o menu está abrindo.
#[derive(Clone, Debug, PartialEq)]
pub struct Context {
    pub weekday: u8,
    pub minutes: u16,
    pub monitor: String,
}

/// "08:30" → 510. Inválido → None.
pub fn parse_hhmm(s: &str) -> Option<u16> {
    let (h, m) = s.trim().split_once(':')?;
    if h.is_empty() || h.len() > 2 || m.len() != 2 {
        return None;
    }
    let (h, m): (u16, u16) = (h.parse().ok()?, m.parse().ok()?);
    (h < 24 && m < 60).then_some(h * 60 + m)
}

impl When {
    /// Tem algum critério? (Sem nenhum, o perfil não é escolhido por horário/monitor.)
    pub fn has_criteria(&self) -> bool {
        !self.days.is_empty() || self.from.is_some() || self.to.is_some() || !self.monitors.is_empty()
    }

    /// Dentro da faixa de horário? Sem faixa (ou faixa inválida/incompleta) = sim.
    pub fn time_ok(&self, minutes: u16) -> bool {
        let (Some(f), Some(t)) = (self.from.as_deref().and_then(parse_hhmm), self.to.as_deref().and_then(parse_hhmm)) else {
            return true;
        };
        match f.cmp(&t) {
            std::cmp::Ordering::Less => minutes >= f && minutes < t,
            std::cmp::Ordering::Greater => minutes >= f || minutes < t, // cruza a meia-noite
            std::cmp::Ordering::Equal => true,
        }
    }

    pub fn matches(&self, ctx: &Context) -> bool {
        // Faixa que cruza a meia-noite: a parte DEPOIS da meia-noite pertence ao dia
        // ANTERIOR ("sexta 22:00–02:00" vale às 01:00 de sábado, não às 01:00 de sexta).
        let after_midnight_part = match (self.from.as_deref().and_then(parse_hhmm), self.to.as_deref().and_then(parse_hhmm)) {
            (Some(f), Some(t)) => f > t && ctx.minutes < t,
            _ => false,
        };
        let day = if after_midnight_part { (ctx.weekday + 6) % 7 } else { ctx.weekday };
        let day_ok = self.days.is_empty() || self.days.contains(&day);
        let mon_ok = self.monitors.is_empty() || self.monitors.iter().any(|m| m.eq_ignore_ascii_case(&ctx.monitor));
        day_ok && self.time_ok(ctx.minutes) && mon_ok
    }
}

/// Agora (hora local do Windows) e o monitor dado.
pub fn now(monitor: String) -> Context {
    let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    Context { weekday: t.wDayOfWeek as u8, minutes: t.wHour * 60 + t.wMinute, monitor }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(weekday: u8, hhmm: &str, monitor: &str) -> Context {
        Context { weekday, minutes: parse_hhmm(hhmm).unwrap(), monitor: monitor.into() }
    }
    fn when(days: &[u8], from: Option<&str>, to: Option<&str>, monitors: &[&str]) -> When {
        When {
            days: days.to_vec(),
            from: from.map(str::to_string),
            to: to.map(str::to_string),
            monitors: monitors.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn hora_valida_e_invalida() {
        assert_eq!(parse_hhmm("08:30"), Some(510));
        assert_eq!(parse_hhmm("0:05"), Some(5));
        assert_eq!(parse_hhmm("23:59"), Some(1439));
        for bad in ["24:00", "12:60", "12", "ab:cd", "1:2", ""] {
            assert_eq!(parse_hhmm(bad), None, "{bad}");
        }
    }

    #[test]
    fn dias_uteis_em_horario_comercial() {
        let w = when(&[1, 2, 3, 4, 5], Some("09:00"), Some("18:00"), &[]);
        assert!(w.matches(&ctx(1, "09:00", "x")));
        assert!(w.matches(&ctx(5, "17:59", "x")));
        assert!(!w.matches(&ctx(5, "18:00", "x"))); // fim exclusivo
        assert!(!w.matches(&ctx(6, "10:00", "x"))); // sábado
        assert!(!w.matches(&ctx(2, "08:59", "x")));
    }

    #[test]
    fn faixa_que_cruza_a_meia_noite() {
        let w = when(&[], Some("22:00"), Some("02:00"), &[]);
        assert!(w.matches(&ctx(3, "23:30", "x")));
        assert!(w.matches(&ctx(3, "01:59", "x")));
        assert!(!w.matches(&ctx(3, "02:00", "x")));
        assert!(!w.matches(&ctx(3, "12:00", "x")));
        // "sexta à noite" ainda vale à 01:00 de sábado (dia anterior marcado).
        let sexta = when(&[5], Some("22:00"), Some("02:00"), &[]);
        assert!(sexta.matches(&ctx(6, "01:00", "x")));
        assert!(!sexta.matches(&ctx(6, "23:00", "x")));
        assert!(sexta.matches(&ctx(5, "23:00", "x")));
        // 01:00 de sexta é a madrugada de QUINTA: não vale.
        assert!(!sexta.matches(&ctx(5, "01:00", "x")));
        // Domingo 22–02 vale na madrugada de segunda (dia 0 → 1).
        let domingo = when(&[0], Some("22:00"), Some("02:00"), &[]);
        assert!(domingo.matches(&ctx(1, "00:30", "x")));
        assert!(!domingo.matches(&ctx(0, "00:30", "x")));
    }

    #[test]
    fn so_monitor_e_combinacoes() {
        let w = when(&[], None, None, &[r"\\.\DISPLAY2"]);
        assert!(w.has_criteria());
        assert!(w.matches(&ctx(0, "10:00", r"\\.\display2")));
        assert!(!w.matches(&ctx(0, "10:00", r"\\.\DISPLAY1")));
        assert!(!When::default().has_criteria());
        assert!(When::default().matches(&ctx(0, "00:00", "")));
        // Faixa incompleta (só "from") é ignorada.
        assert!(when(&[], Some("10:00"), None, &[]).time_ok(5));
    }
}

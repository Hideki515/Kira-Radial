// Sem janela de console no build release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kira_radial_lib::run()
}

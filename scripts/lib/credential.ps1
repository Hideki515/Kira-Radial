# Ler/gravar uma credencial genérica no Gerenciador de Credenciais do Windows (só o usuário
# atual lê). Usado para a senha da chave de assinatura das atualizações — nada em arquivo.

if (-not ("KiraCred" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class KiraCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct CREDENTIAL {
    public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
    public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWrite(ref CREDENTIAL c, uint flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredRead(string target, uint type, uint flags, out IntPtr cred);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr cred);
  const uint GENERIC = 1, LOCAL_MACHINE = 2;

  public static void Write(string target, string user, string secret) {
    byte[] blob = Encoding.Unicode.GetBytes(secret);
    var c = new CREDENTIAL { Type = GENERIC, TargetName = target, UserName = user, Persist = LOCAL_MACHINE,
      CredentialBlobSize = (uint)blob.Length, CredentialBlob = Marshal.AllocHGlobal(blob.Length) };
    try {
      Marshal.Copy(blob, 0, c.CredentialBlob, blob.Length);
      if (!CredWrite(ref c, 0)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    } finally { Marshal.FreeHGlobal(c.CredentialBlob); }
  }

  public static string Read(string target) {
    IntPtr p;
    if (!CredRead(target, GENERIC, 0, out p)) return null;
    try {
      var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      return Marshal.PtrToStringUni(c.CredentialBlob, (int)c.CredentialBlobSize / 2);
    } finally { CredFree(p); }
  }
}
"@
}

$KiraSigningCredential = "KiraRadial/updater-signing-key"

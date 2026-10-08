# Native Explorer-style folder picker. The helper console stays hidden; only
# this process's own dialog is raised. No browser/other application's HWND is
# touched, and no focus/security policy or global Windows setting is changed.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace ContinuityFolderPicker {
    [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IFileDialog {
        [PreserveSig] int Show(IntPtr owner);
        void SetFileTypes(uint count, IntPtr filters);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IFileDialogEvents events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem folder);
        void SetFolder(IShellItem folder);
        void GetFolder(out IShellItem folder);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName(out IntPtr name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem item);
        void AddPlace(IShellItem item, uint alignment);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
        void Close(int result);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr filter);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IShellItem {
        void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr result);
        void GetParent(out IShellItem parent);
        void GetDisplayName(uint kind, out IntPtr name);
        void GetAttributes(uint mask, out uint attributes);
        void Compare(IShellItem item, uint hint, out int order);
    }

    [ComImport, Guid("00000114-0000-0000-C000-000000000046"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IOleWindow {
        [PreserveSig] int GetWindow(out IntPtr window);
        void ContextSensitiveHelp([MarshalAs(UnmanagedType.Bool)] bool enter);
    }

    [ComVisible(true), Guid("973510DB-7D7F-452B-8975-74A85828D354"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IFileDialogEvents {
        [PreserveSig] int OnFileOk(IFileDialog dialog);
        [PreserveSig] int OnFolderChanging(IFileDialog dialog, IShellItem folder);
        [PreserveSig] int OnFolderChange(IFileDialog dialog);
        [PreserveSig] int OnSelectionChange(IFileDialog dialog);
        [PreserveSig] int OnShareViolation(IFileDialog dialog, IShellItem item, out uint response);
        [PreserveSig] int OnTypeChange(IFileDialog dialog);
        [PreserveSig] int OnOverwrite(IFileDialog dialog, IShellItem item, out uint response);
    }

    public static class Native {
        [StructLayout(LayoutKind.Sequential)]
        public struct Rect { public int Left, Top, Right, Bottom; }
        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetWindowRect(IntPtr window, out Rect rect);
        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool IsWindowVisible(IntPtr window);
        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetWindowPos(IntPtr window, IntPtr after,
            int x, int y, int width, int height, uint flags);
        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetForegroundWindow(IntPtr window);
    }

    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    public sealed class Events : IFileDialogEvents {
        public bool Raised;
        private readonly Rectangle workArea;
        public Events(Rectangle area) { workArea = area; }
        public void Raise(IFileDialog dialog) {
            if (Raised) return;
            // A folder notification may precede window creation. A short-lived
            // timer retries until the dialog has its HWND, then stops forever.
            try {
                IntPtr window;
                if (((IOleWindow)dialog).GetWindow(out window) < 0 || window == IntPtr.Zero ||
                    !Native.IsWindowVisible(window)) return;
                Native.Rect rect;
                if (!Native.GetWindowRect(window, out rect)) return;
                int width = Math.Min(Math.Max(960, rect.Right - rect.Left), workArea.Width - 24);
                int height = Math.Min(Math.Max(680, rect.Bottom - rect.Top), workArea.Height - 24);
                int x = workArea.Left + (workArea.Width - width) / 2;
                int y = workArea.Top + (workArea.Height - height) / 2;
                // HWND_TOPMOST + SWP_SHOWWINDOW applies to the real dialog,
                // not just its invisible owner. This remains visible even if
                // Windows declines the separate keyboard-foreground request.
                Raised = Native.SetWindowPos(window, new IntPtr(-1), x, y, width, height, 0x0040);
                if (Raised) Native.SetForegroundWindow(window);
            } catch (COMException) { } catch (InvalidCastException) { }
        }
        public int OnFileOk(IFileDialog dialog) { return 0; }
        public int OnFolderChanging(IFileDialog dialog, IShellItem folder) { return 0; }
        public int OnFolderChange(IFileDialog dialog) { Raise(dialog); return 0; }
        public int OnSelectionChange(IFileDialog dialog) { Raise(dialog); return 0; }
        public int OnShareViolation(IFileDialog dialog, IShellItem item, out uint response) { response = 0; return 0; }
        public int OnTypeChange(IFileDialog dialog) { Raise(dialog); return 0; }
        public int OnOverwrite(IFileDialog dialog, IShellItem item, out uint response) { response = 0; return 0; }
    }

    public static class Picker {
        public static string Choose() {
            Application.EnableVisualStyles();
            Rectangle area = Screen.FromPoint(Cursor.Position).WorkingArea;
            IFileDialog dialog = null;
            IShellItem result = null;
            uint cookie = 0;
            bool advised = false;
            using (Form owner = new Form())
            using (Timer timer = new Timer()) {
                owner.FormBorderStyle = FormBorderStyle.None;
                owner.StartPosition = FormStartPosition.Manual;
                owner.Bounds = new Rectangle(area.Left + area.Width / 2, area.Top + area.Height / 2, 1, 1);
                owner.Text = "Continuity folder picker";
                owner.ShowInTaskbar = false;
                owner.Opacity = 0;
                owner.TopMost = true;
                Events events = new Events(area);
                try {
                    dialog = (IFileDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(
                        new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")));
                    uint options;
                    dialog.GetOptions(out options);
                    // Pick folders, real filesystem only, existing paths,
                    // no working-directory change or recent-document entry.
                    dialog.SetOptions((options | 0x20 | 0x40 | 0x800 | 0x8 | 0x02000000) & ~0x200u);
                    dialog.SetTitle("Choose a folder for the Continuity library");
                    dialog.Advise(events, out cookie);
                    advised = true;
                    timer.Interval = 80;
                    timer.Tick += delegate { events.Raise(dialog); if (events.Raised) timer.Stop(); };
                    owner.Show();
                    timer.Start();
                    int status = dialog.Show(owner.Handle);
                    if (status == unchecked((int)0x800704C7)) return null;
                    Marshal.ThrowExceptionForHR(status);
                    dialog.GetResult(out result);
                    IntPtr name = IntPtr.Zero;
                    try {
                        result.GetDisplayName(0x80058000, out name); // SIGDN_FILESYSPATH
                        return Marshal.PtrToStringUni(name);
                    } finally { if (name != IntPtr.Zero) Marshal.FreeCoTaskMem(name); }
                } finally {
                    timer.Stop();
                    try {
                        if (dialog != null && advised) dialog.Unadvise(cookie);
                    } finally {
                        try {
                            if (result != null) Marshal.FinalReleaseComObject(result);
                        } finally {
                            try {
                                if (dialog != null) Marshal.FinalReleaseComObject(dialog);
                            } finally {
                                owner.Close();
                                GC.KeepAlive(events);
                            }
                        }
                    }
                }
            }
        }
    }
}
'@ -ReferencedAssemblies System.Windows.Forms, System.Drawing
try {
    $chosen = [ContinuityFolderPicker.Picker]::Choose()
    if ($null -ne $chosen) { [Console]::Write($chosen) }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}

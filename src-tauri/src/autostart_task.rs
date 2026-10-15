pub fn quote_arg(value: &str) -> String {
    let mut out = String::from("\"");
    let mut slashes = 0;
    for c in value.chars() {
        if c == '\\' {
            slashes += 1;
        } else {
            out.push_str(&"\\".repeat(if c == '"' { slashes * 2 + 1 } else { slashes }));
            out.push(c);
            slashes = 0;
        }
    }
    out.push_str(&"\\".repeat(slashes * 2));
    out.push('"');
    out
}

fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub fn xml(sid: &str, exe: &str, game: &str, working: &str) -> String {
    let query = format!(
        r#"*[System[Provider[@Name="Microsoft-Windows-Security-Auditing"] and EventID=4688] and EventData[Data[@Name="NewProcessName"]="{game}" and (Data[@Name="SubjectUserSid"]="{sid}" or Data[@Name="TargetUserSid"]="{sid}")]]"#
    );
    let subscription = escape(&format!(
        r#"<QueryList><Query Id="0" Path="Security"><Select Path="Security">{}</Select></Query></QueryList>"#,
        escape(&query)
    ));
    let source = escape(game);
    let exe = escape(exe);
    let working = escape(working);
    format!(
        r#"<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<RegistrationInfo><Description>Start DWCompanion when Warframe starts.</Description><Source>{source}</Source></RegistrationInfo>
<Triggers><EventTrigger><Enabled>true</Enabled><Subscription>{subscription}</Subscription></EventTrigger></Triggers>
<Principals><Principal id="User"><UserId>{sid}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>false</AllowHardTerminate><StartWhenAvailable>false</StartWhenAvailable><ExecutionTimeLimit>PT0S</ExecutionTimeLimit></Settings>
<Actions Context="User"><Exec><Command>{exe}</Command><WorkingDirectory>{working}</WorkingDirectory></Exec></Actions></Task>"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quotes_windows_arguments() {
        assert_eq!(
            quote_arg(r"C:\Games & Tools\Warframe.x64.exe"),
            "\"C:\\Games & Tools\\Warframe.x64.exe\""
        );
        assert_eq!(quote_arg("folder\\"), "\"folder\\\\\"");
        assert_eq!(quote_arg("a\"b"), "\"a\\\"b\"");
    }
    #[test]
    fn escapes_both_xml_layers() {
        let task = xml(
            "S-1-5-21-1",
            "C:\\Приложение & Tools\\dwc.exe",
            "C:\\player's & game\\Warframe.x64.exe",
            "C:\\Tools",
        );
        assert!(task.contains("Приложение &amp; Tools"));
        assert!(task.contains("player&amp;apos;s &amp;amp; game"));
        assert!(task.contains("<RunLevel>LeastPrivilege</RunLevel>"));
        assert!(task.contains("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>"));
        assert!(!task.contains("HighestAvailable"));
    }
}

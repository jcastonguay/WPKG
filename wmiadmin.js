/* Minor alterations 2011 Jason Castonguay 

   Dec 5, 2011  - v.2.2.1
		- Changed long to longl in order to compile with closure-compiler


Todo:
	JSON instead of XML
	STDIO instead of create file
	Reformat to be more like facter
*/

/*
   WMI Administrator script. April 28th, 2009. v.2.2.

   Copyright (C) 2006-2009 Dmitriy Khudorozhkov

   This software is provided "as-is", without any express or implied warranty.
   In no event will the author be held liable for any damages arising from the
   use of this software.

   Permission is granted to anyone to use this software for any purpose,
   including commercial applications, and to alter it and redistribute it
   freely, subject to the following restrictions:

   1. The origin of this software must not be misrepresented; you must not
      claim that you wrote the original software. If you use this software
      in a product, an acknowledgment in the product documentation would be
      appreciated but is not required.

   2. Altered source versions must be plainly marked as such, and must not be
      misrepresented as being the original software.

   3. This notice may not be removed or altered from any source distribution.

   --------------------------------------------

   Version tracker:

   January  6, 2006 - version 1.0:

                      - basic facilities;
                      - command-line interface.

   January 19, 2006 - version 1.01:

                      - source code bugfixes.

   January 23, 2006 - version 1.02:

                      - Win32_NetworkLoginProfile and Win32_TimeZone
                        classes added;

                      - multiple translation functions added;

                      - silent mode switch & multiple-IPs-at-a-time capability
                        added;

                      - code and xml layout cleaned up.

   January 26, 2006 - version 1.03:

                      - Win32_IDEController, Win32_TapeDrive,
                        Win32_POTSModem, Win32_Fan, Win32_HeatPipe and
                        Win32_Refrigeration added;

                      - fixed bug when saving non-ascii xml data;
                      - fixed some other minor bugs and typos;
                      - more translation functions added;
                      - code for 'pretty printed'-style xml serialization added.

   January 27, 2006 - version 1.031:

                      - minor bugfix (within collectTapeDriveInfo).

   February 6, 2006 - version 1.04:

                      - minor bugs fixed
                        (within translate_date and translate_modem_port);

                      - Win32_BootConfiguration,
                        Win32_OSRecoveryConfiguration,
                        Win32_ODBCDataSourceSpecification,
                        Win32_ODBCDriverSpecification,
                        Win32_ODBCTranslatorSpecification,
                        Win32_PrinterConfiguration (via Win32_Printer) and
                        Win32_SystemEnclosure added;

                      - added PrintProcessor monitoring (Win32_Printer),
                        PasswordAge monitoring (Win32_NetworkLoginProfile);

                      - translation functions added for introduced classes,
                        translate_pass_age added (PasswordAge property).

   January 8, 2007 - version 1.1:

                      - all functionality wrapped in WMIcollector object;
                      - multiple IPs are natively supported by WMIcollector;
                      - WMI connections are cached;
                      - dropped 'xmlAttachChildToParent' method;
                      - fixed numerous small bugs and typos;
                      - fixed issues with Win32_NetworkLoginProfile flags;
                      - translate_processor_family updated.

   July 25, 2007 - version 1.2:

                      - script now accepts DOS-like parameter syntax; '/silent'
                        (silent mode switch), '/username:' and '/password:'
                        (alternate credentials), '/domain:' (alternate domain)
                        or '/auth:' (Kerberos authentication is used if this
                        key is equal to 'kerberos') can now be specified;

                      - all file-system related stuff moved out of
                        WMICollector object; WMICollector just populates it's
                        _xml array with DOMDocuments;

                      - WMICollector can now be used outside of WSH
                        (e.g. in MS IE user javascript).

   June 19, 2008 - version 2.0:
 
                       - script was partially rewritten, that increased it's readibility
                         and reduced it's size by 25%.

                       - new UI was created, that allows you to define an IP ranges and
                         desired info to gather, and review the collection process.

   January 8, 2009 - version 2.1:
 
                       - jQuery updated to 1.3.1, some parts of UI-handling code was
                         rewritten.

   April 28, 2009 - version 2.2:
 
                       - jQuery updated to 1.3.2, minimized version is now used.

                       - script will now correctly handles connection errors when scanning
                         IP ranges.

                       - fixed silly error that could lead to querying IPs in eternal cycle.

  ---------------------------------------------

     - Dmitriy Khudorozhkov, dmitrykhudorozhkov@yahoo.com
*/

try
{
  var setTimeout_ = setTimeout || null;
}
catch(e) { setTimeout_ = null; };

if(typeof(WScript) == "object")
{
	// Helper methods:
	function ipToLong(ip)
	{
		var a = parseInt(ip[0]);
		var b = parseInt(ip[1]);
		var c = parseInt(ip[2]);
		var d = parseInt(ip[3]);

		return d + (256 * c) + (256 * 256 * b) + (256 * 256 * 256 * a);
	}

	function longToIp(longl)
	{
		var a = "";
		var b = "";
		var c = "";
		var d = "";

		for(var i = 3; i >= 0; i--)
		{
			var n = parseInt(longl / Math.pow(256, i));
			longl -= parseInt(longl / Math.pow(256, i)) * Math.pow(256, i);

			switch(i)
			{
				case 3: a = n; break;
				case 2: b = n; break;
				case 1: c = n; break;
				case 0: d = n; break;
			}
		}

		return [a, b, c, d];
	}

  if(!setTimeout_)
  {
    setTimeout_ = function(method, timeout)
    {
      WScript.Sleep(timeout);
      method();
    }
  }

  var local_ip = "127.0.0.1";

  var wmic = null;
  var Args = WScript.Arguments;

  if(!Args.length)
  {
    wmic = new WMIcollector(local_ip, null, null, null, null, "all"); 
  }
  else
  {
    var ArgsNamed = Args.Named, ArgsUnnamed = Args.Unnamed;

    var username = ArgsNamed.Exists("username") ? ArgsNamed.Item("username") : null;
    var password = ArgsNamed.Exists("password") ? ArgsNamed.Item("password") : null;
    var domain   = ArgsNamed.Exists("domain")   ? ArgsNamed.Item("domain")   : null;

    var secure = ArgsNamed.Exists("auth") ? (ArgsNamed.Item("auth") == "kerberos") : false;
    var components = ArgsNamed.Exists("components") ? ArgsNamed.Item("components") : "all";

    var ips = [];
    for(var i = 0; i < ArgsUnnamed.length; i++)
	{
		var ip = ArgsUnnamed(i);
		if(ip.length && (ip.indexOf("-") != -1))
		{
			// This is a IP range.
			var range = ip.split("-");
			var startIP = ipToLong(range[0].split("."));
			var endIP = ipToLong(range[1].split("."));

			for(var i = startIP; i <= endIP; i++)
				ips[ips.length] = longToIp(i).join(".");
		}
		else ips[ips.length] = ip; // single IP address
	}

    if(!ips.length) ips[0] = local_ip;

    wmic = new WMIcollector(ips, username, password, domain, secure, components);
  }

  wmic.RunQuery();
}

function WMIcollector(ips, username, password, domain, kerberos, components,
						component_start_callback, component_complete_callback,
						ip_start_callback, ip_complete_callback, finish_callback)
{
  // Public API:

  // RunQuery - runs the query which this particular WMIcollector is set up to.
  // Should be called without parameters.
  this.RunQuery = function(prevIP)
  {
	var self = this;
	if(!prevIP)
	{
      if(this._callbacks[2])
        this._callbacks[2](this._ip[0]);

	  setTimeout_(function()
	  {
		self._collectAll(self._ip[0]);
	  },
	  100);
	  return;
	}

	var len = this._ip.length;
    for(var i = 0; i < len; i++)
      if(prevIP == this._ip[i])
	    break;

	i++;
	if(i < len)
	{
	  var cur_ip = this._ip[i];

      if(this._callbacks[2])
        this._callbacks[2](cur_ip);

	  setTimeout_(function()
	  {
		self._collectAll(cur_ip);
	  },
	  100);
	}
	else
	{
	  // the end of query:
      if(this._callbacks[4])
        this._callbacks[4]();
	}
  }

  // String helper functions:

  this._trim = function(src)
  {
    var str_src = String(src);

    // Leading spaces:
    var empty = true;
    for(var l = 0; l < str_src.length; l++)
    {
      if(str_src.charAt(l) != " ")
      {
        empty = false;
        break;
      }
    }

    if(empty) return "";

    // Trailing spaces:
    for(var t = str_src.length - 1; t >= 0; t--)
    {
      if(str_src.charAt(t) != " ")
        break;
    }

    return str_src.substring(l, t + 1);
  }

  this._isempty = function(str)
  {
    if(!str || (String(str) == "null") || (this._trim(String(str)) == ""))
      return true;

    return false;
  }

  // Array helper functions:

  this._removeDuplicates = function(array)
  {
    var newArray = [];
    var len = array.length;

    for(var i = 0; i < len; i++)
    {
      var element = array[i];
	  var len2 = newArray.length;

      for(var j = 0; j < len2; j++)
        if(newArray[j] == element)
          break;

      if(j == len2)
        newArray[len2] = element;
    }

    return newArray;
  }

  this._hasElement = function(array, string)
  {
    var len = array.length;

    for(var i = 0; i < len; i++)
      if(array[i] == string)
        return true;

    return false;
  }

  // XML helper functions:

  this._xmlSetAttribute = function(doc, node, attributeName, attributeValue)
  {
    var Attribute = doc.createAttribute(attributeName);
    var AttributeText = doc.createTextNode(this._trim(attributeValue));

    Attribute.appendChild(AttributeText);
    node.setAttributeNode(Attribute);
  }

  this._xmlCreateChildNode = function(doc, parent, nodeName)
  {
    var Element = doc.createElement(nodeName);

    parent.appendChild(Element);

    return Element;
  }

  this._xmlCreateChildNodeWithAttribute = function(doc, parent, nodeName, attributeName, attributeValue)
  {
    var Element = doc.createElement(nodeName);

    parent.appendChild(Element);

    this._xmlSetAttribute(doc, Element, attributeName, String(attributeValue));

    return Element;
  }

  this._xmlCreateChildTextNode = function(doc, parent, nodeName, nodeContent)
  {
    var str = this._trim(String(nodeContent));

    if(this._isempty(str)) return null;

    var Element = doc.createElement(nodeName);
    var ElementText = doc.createTextNode(str);

    parent.appendChild(Element);
    Element.appendChild(ElementText);

    return Element;
  }

  this._xmlCreateChildTextNodeWithAttribute = function(doc, parent, nodeName, nodeContent, attributeName, attributeValue)
  {
    var str = this._trim(String(nodeContent));

    if(this._isempty(str)) return null;

    var Element = doc.createElement(nodeName);
    var ElementText = doc.createTextNode(str);

    parent.appendChild(Element);
    Element.appendChild(ElementText);

    this._xmlSetAttribute(doc, Element, attributeName, attributeValue);

    return Element;
  }

  this._xmlWriteToFile = function(filename, doc)
  {
    var fso = new ActiveXObject("Scripting.FileSystemObject");

    // SAXreader/MXXMLwriter are used to create & save 'neat' xml files.
    //
    var writer = new ActiveXObject("Msxml2.MXXMLWriter.3.0");

    writer.indent = true;            // write xml in a 'pretty printed'-way
    writer.omitXMLDeclaration = true;

    var reader = new ActiveXObject("Msxml2.SAXXMLReader.3.0");

    reader.contentHandler = writer;
    reader.errorHandler = writer;

    var xmlFile = fso.CreateTextFile(filename, true, true);

    var encoding = "UTF-16";

    reader.parse(doc);

    xmlFile.WriteLine("<?xml version=\"1.0\" encoding=\"" + encoding + "\"?>");
    xmlFile.WriteLine("<?xml-stylesheet type=\"text/xsl\" href=\"wmi_admin.xsl\"?>");
    xmlFile.Write(writer.output);

    xmlFile.Close();
  }

  // WMI setup & query routines:

  this.init = function(ips, username, password, domain, kerberos, components,
						component_start_callback, component_complete_callback,
						ip_start_callback, ip_complete_callback, finish_callback)
  {
    // ctor:

    this._ip      = [];
    this._service = [];

    this._curserv  = null;
    this._domain   = domain   ? domain   : "";
    this._password = password ? password : "";
    this._username = username ? username : "";

    this._kerberos = ((kerberos == undefined) || (kerberos == null)) ? false : kerberos;

    this._components = [];
    this._callbacks  = [];

    if(typeof(ips) == "string")
      this._ip[0] = ips;
    else
    {
      if(ips.constructor == Array)
      {
        this._ip = this._removeDuplicates(ips);
      }
    }

    if(components)
    {
      if(typeof(components) == "string")
        this._components[0] = components;
      else
      {
        if(components.constructor == Array)
        {
          this._components = this._removeDuplicates(components);
        }
      }
    }

    if(component_start_callback)
      this._callbacks[0] = component_start_callback;

	if(component_complete_callback)
      this._callbacks[1] = component_complete_callback;

    if(ip_start_callback)
      this._callbacks[2] = ip_start_callback;

    if(ip_complete_callback)
      this._callbacks[3] = ip_complete_callback;

    if(finish_callback)
      this._callbacks[4] = finish_callback;

    // List of all the components that can be queried. Format:
    // ["short-name", "friendly-name", "query-name", "xml-plural", "xml-singular", query-method]

	// Where:

    // "short-name" - name that is used by user/UI to "switch on" querying this component
    // "friendly-name" - name that is given out to callback functions once the query of the component starts/finishes
    // "xml-plural" - name of the component group (if element is in a group) that is used to populate resulting XML.
    // "xml-singular" - name of the single item in a component group (if element is in a group) that is used to populate resulting XML.
    // "query-method" - reference (not the name!) of the method that queries objects of the component.

    this.list = [

	// Hardware:
	[
	["baseboard", "Base board", "Win32_BaseBoard", "Base Boards", "Base Board", this._collectBaseBoardInfo],
	["processor", "Processor", "Win32_Processor", "Processors", "Processor", this._collectProcessorInfo],
	["bios", "BIOS", "Win32_BIOS", "BIOSs", "BIOS", this._collectBiosInfo],
	["video", "Video card", "Win32_VideoController", "Video Adapters", "Video Adapter", this._collectVideoAdapterInfo],
	["sound", "Sound card", "Win32_SoundDevice", "Sound devices", "Sound device", this._collectSoundInfo],

	["memory", "Operational memory", "Win32_PhysicalMemory", "Physical Memory Banks", "Memory Bank", this._collectMemoryInfo],
	["harddrive", "Hard drives", "Win32_DiskDrive", "Disk Drives", "Disk Drive", this._collectDiskDrivesInfo],
	["cdrom", "CD ROM drives", "Win32_CDROMDrive", "CD-ROM Drives", "CD-ROM Drive", this._collectCDROMInfo],
	["floppy", "Floppy drives", "Win32_FloppyDrive", "Floppy Disk Drives", "Floppy Disk Drive", this._collectFloppyInfo],
	["tape", "Tape drives", "Win32_TapeDrive", "Tape Drives", "Tape Drive", this._collectTapeDriveInfo],

	["ide", "IDE controllers", "Win32_IDEController", "IDE Controllers", "IDE Controller", this._collectIdeControllerInfo],
	["scsi", "SCSI controllers", "Win32_SCSIController", "SCSI Controllers", "SCSI Controller", this._collectScsiControllerInfo],

	["display", "Display", "Win32_DesktopMonitor", "Desktop Monitors", "Desktop Monitor", this._collectDisplayInfo],
	["keyboard", "Keyboard", "Win32_Keyboard", "Keyboards", "Keyboard", this._collectKeyboardInfo],
	["mouse", "Pointing devices", "Win32_PointingDevice", "Pointing Devices", "Pointing Devices", this._collectPointingDeviceInfo],
	["printer", "Printers", "Win32_Printer", "Printers", "Printer", this._collectPrinterInfo],
	["pots", "POTS modems", "Win32_POTSModem", "Plain Old Telephone Service (POTS) modems", "POTS modem", this._collectPOTSModemInfo],

	["firewire", "Firewire controllers", "Win32_1394Controller", "IEEE 1394 Controllers", "IEEE 1394 Controller", this._collect1394ControllerInfo],
	["usb", "USB controllers", "Win32_USBController", "USB Conrollers", "USB Conroller", this._collectUsbControllerInfo],
	["pcmcia", "PCMCIA controllers", "Win32_PCMCIAController", "PCMCIA Controllers", "PCMCIA Controller", this._collectPcmciaControllerInfo],
	["serial", "Serial port controllers", "Win32_SerialPort", "Serial Ports", "Serial Port", this._collectSerialPortInfo],
	["parallel", "Parallel port controllers", "Win32_ParallelPort", "Parallel Ports", "Parallel Port", this._collectParallelPortInfo],
	["ports", "Port connectors", "Win32_PortConnector", "Port Connectors", "Port Connector", this._collectPortConnectorsInfo],
	["ir", "Infrared devices", "Win32_InfraredDevice", "Infrared Devices", "Infrared Device", this._collectIrDeviceInfo],

	["netboard", "Netword boards", "Win32_NetworkAdapter", "Network Adapters", "Network Adapter", this._collectNetworkAdapterInfo],

	["fan", "Cooler fans", "Win32_Fan", "Cooling fans", "Cooling fan", this._collectFanInfo],
	["pipe", "Heat pipes", "Win32_HeatPipe", "Heat pipe cooling devices", "Heat pipe cooling device", this._collectHeatPipeInfo],
	["refrigeration", "Refrigeration devices", "Win32_Refrigeration", "Refrigeration devices", "Refrigeration device", this._collectRefrigerationInfo],

	["enclosure", "Enclosure", "Win32_SystemEnclosure", "System enclosures", "System enclosure", this._collectSystemEnclosureInfo],

	["battery", "Battery", "Win32_Battery", "Batteries", "Battery", this._collectBatteryInfo],
	["portablebattery", "Portable battery", "Win32_PortableBattery", "Portable Batteries", "Portable battery", this._collectPortableBatteryInfo],
	["ups", "UPS devices", "Win32_UninterruptiblePowerSupply", "UPS Devices", "UPS Device", this._collectUPSInfo]
	],

	// Software:
	[
	["soft_general", "Software in general", "Win32_ComputerSystem", "Computer Systems", "Computer System", this._collectComputerSystemInfo],
	["soft_os", "Operating system info", "Win32_OperatingSystem", "Operating Systems", "Operating System", this._collectOsInfo],
	["soft_osboot", "OS boot info", "Win32_BootConfiguration", "Boot Configurations", "Boot Configuration", this._collectOSBootInfo],
	["soft_osrecover", "OS recovery info", "Win32_OSRecoveryConfiguration", "OS Recovery Configurations", "OS Recovery Configuration", this._collectOSRecoveryInfo],
	["soft_osqfe", "OS patches", "Win32_QuickFixEngineering", "Quick Fix Engineering (QFE) Packs", "QFE Pack", this._collectQFEInfo],

	["soft_odbcsource", "ODBC data sources", "Win32_ODBCDataSourceSpecification", "ODBC Data Sources", "ODBC Data Source", this._collectODBCDataSourceInfo],
	["soft_odbcdriver", "ODBC drivers", "Win32_ODBCDriverSpecification", "ODBC Drivers", "ODBC Driver", this._collectODBCDriverInfo],
	["soft_odbctranslator", "ODBC translators", "Win32_ODBCTranslatorSpecification", "ODBC Translators", "ODBC Translator", this._collectODBCTranslatorInfo],

	["soft_users", "Users", "Win32_UserAccount", "User Accounts", "User Account", this._collectUserInfo],
	["soft_groups", "User groups", "Win32_Group", "Group accounts", "Group account", this._collectGroupInfo],
	["soft_sessions", "Login sessions", "Win32_LogonSession", "Logon Sessions", "Logon Session", this._collectLogonSessionInfo],
	["soft_profiles", "Login profiles", "Win32_NetworkLoginProfile", "Network Login Profiles", "Network Login Profile", this._collectNetworkLoginProfileInfo],

	["soft_product", "Installed software", "Win32_Product", "Installed Software", "Software Product", this._collectProductInfo],
	["soft_netprotocol", "Installed network protocols", "Win32_NetworkProtocol", "Network protocols", "Network protocol", this._collectNetworkProtocolInfo],
	["soft_codec", "Installed codecs", "Win32_CodecFile", "Audio/Video Codecs", "Codec", this._collectCodecInfo],

	["soft_time", "Time", "Win32_LocalTime", "Local Time Settings", "Local Time", this._collectTimeInfo],
	["soft_zone", "Time zone", "Win32_TimeZone", "Time Zone Settings", "Time Zone", this._collectTimeZoneInfo],

	["soft_ping", "Ping", "Ping", "", "", this._collectPingData] // special case
	]];
  }

  this._SetupService = function(ip)
  {
    if(!this._service[ip])
    {
	  try
	  {
        var locator = new ActiveXObject("WbemScripting.SWbemLocator");

        this._service[ip] = locator.ConnectServer(ip, "root\\cimv2", this._username, this._password, "",
							this._domain ? (this._kerberos ? ("kerberos:" + this._domain) : ("NTLMDOMAIN:" + this._domain)) : "");

        this._service[ip].Security_.ImpersonationLevel = 3; // == Impersonate
	  }
	  catch(err)
	  {
		return [false, err.description];
	  }
    }

    this._curserv = this._service[ip];
	return [true, ""];
  }

  this._ExecQuery = function(className)
  {
    return this._curserv.InstancesOf(className);
  }

  this._ExecQueryWithWhereClause = function(className, condition)
  {
    return this._curserv.ExecQuery("Select * from " + className + " Where " + condition);
  }

  // Primary data collection functions:

  // _collectAll - starts the collection process for a given IP.
  this._collectAll = function(ip)
  {
    var xmlDoc = new ActiveXObject("Msxml2.DOMDocument");
    var root = xmlDoc.createElement("Root");
    xmlDoc.appendChild(root);

    var meta = this._xmlCreateChildNode(xmlDoc, root, "Metadata");
    this._xmlCreateChildTextNode(xmlDoc, meta, "IP", ip);

    var dt = new Date();
    this._xmlCreateChildTextNode(xmlDoc, meta, "Date", (dt.getMonth() + 1) + "/" + dt.getDate() + "/" + dt.getFullYear());
    this._xmlCreateChildTextNode(xmlDoc, meta, "Time", (dt.getHours() < 10 ? "0" + dt.getHours() : dt.getHours()) + ":" +
                                                 (dt.getMinutes() < 10 ? "0" + dt.getMinutes() : dt.getMinutes()) + ":" +
                                                 (dt.getSeconds() < 10 ? "0" + dt.getSeconds() : dt.getSeconds()));

    var set = this._SetupService(ip);

	if(set[0])
	{
		this._collectComponent(xmlDoc, root, 0, 0, ip);
	}
	else
	{
	  if(this._callbacks[3])
		this._callbacks[3](set[1]);

	  this.RunQuery(ip);
	}
  }

  // _collectComponent - collects info on a given component, and continues this process.
  // It also handles the output once the end of the components list is reached.
  this._collectComponent = function(doc, root, listIndex, componentIndex, ip)
  {
	var component = this.list[listIndex][componentIndex];

	if(!componentIndex)
	{
	  var branch = null;

	  switch(listIndex)
	  {
		case 0: branch = doc.createElement("Hardware"); break;
		case 1: branch = doc.createElement("Software"); break;
	  }

	  if(branch)
	  {
	    root = doc.firstChild;
		root.appendChild(branch);
		root = branch;
	  }
	  else return;
	}

	var name = component[0];
	var fullname = component[1];
	var query = component[2];
	var plural = component[3];
	var singular = component[4];
	var method = component[5];

	ip = ip || null;
	var self = this;

	setTimeout_(function()
	{
      if(self._hasElement(self._components, name) || (self._components[0] == "all"))
      {
        if(self._callbacks[0])
          self._callbacks[0](fullname);

        var result = self.doQuery(query, plural, singular, method, ip);
        if(result)
        {
          root.appendChild(result.firstChild);

          if(self._callbacks[1])
            self._callbacks[1](fullname);
        }
	  }

      componentIndex++;

	  if(componentIndex == self.list[listIndex].length)
	  {
		componentIndex = 0;

		if(++listIndex == self.list.length)
		{
		  // We've reached the end - all info on this IP is collected.
		  var fname = "result-" + String(ip).replace(/\./g, "-") + ".xml";
		  self._xmlWriteToFile(fname, doc);

		  if(self._callbacks[3])
			self._callbacks[3](fname);

	      self.RunQuery(ip);
		  return;
		}
	  }

      self._collectComponent(doc, root, listIndex, componentIndex, ip);
	},
	100);
  }

  // doQuery - does a single component query.
  this.doQuery = function(query, plural, singular, method, ip)
  {
    if(query == "Ping")
    {
      var xmlDoc = method.call(this, ip);
      return xmlDoc;
    }

    var fc = new Enumerator(this._ExecQuery(query));

    var xmlDoc = null, colItem = null, numItems = 0;

    for (; !fc.atEnd(); fc.moveNext())
      numItems++;

    if(numItems > 0)
    {
      xmlDoc = new ActiveXObject("Msxml2.DOMDocument");

      if(numItems > 1)
      {
        colItem = xmlDoc.createElement("Item");
        xmlDoc.appendChild(colItem);
        this._xmlSetAttribute(xmlDoc, colItem, "name", plural);
      }

      var i = 1;
      for (fc.moveFirst(); !fc.atEnd(); fc.moveNext())
      {
        var Obj = fc.item();

        var root, num = "";
        if(colItem)
        {
          root = xmlDoc.createElement("Element");
          num = " " + String(i);
        }
        else
        {
          root = xmlDoc.createElement("Item");
        }

        this._xmlSetAttribute(xmlDoc, root, "name", singular + String(num));
        if(colItem)
        {
          colItem.appendChild(root);
        }
        else
        {
          xmlDoc.appendChild(root);
        }

		method.call(this, Obj, xmlDoc, root);
	  }

      return xmlDoc;
	}
  }

  // Query methods follow.

  // Hardware monitoring:

  this._collectBaseBoardInfo = function(Obj, xmlDoc, root)
  {
    if(Obj.ConfigOptions != null)
    {
      var config_node = this._xmlCreateChildNodeWithAttribute(xmlDoc, root, "Config", "name", "Configuration of the jumpers and switches");

      var i_count = 1;
      var cs = Obj.ConfigOptions.toArray();
      var cc = new Enumerator(cs);

      for (; !cc.atEnd(); cc.moveNext())
      {
        var conf_obj = cc.item();
        this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "Option" + String(i_count), String(conf_obj), "name", "Option " + String(i_count));

        i_count++;
      }
    }

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "HostingBoard", Obj.HostingBoard, "name", "Is motherboard?");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNode(xmlDoc, root, "Model", Obj.Model);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNode(xmlDoc, root, "Product", Obj.Product);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "RequiresDaughterBoard", Obj.RequiresDaughterBoard, "name", "Requires Daughterboard");
    this._xmlCreateChildTextNode(xmlDoc, root, "SerialNumber", Obj.SerialNumber);
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
    this._xmlCreateChildTextNode(xmlDoc, root, "Version", Obj.Version);
  }

  this._collectProcessorInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Architecture", this._translate_processor_architecture(Obj.Architecture));
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNode(xmlDoc, root, "Caption", Obj.Caption);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CpuStatus", this._translate_processor_status(Obj.CpuStatus), "name", "CPU status");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CurrentClockSpeed", Obj.CurrentClockSpeed, "name", "Current clock speed, MHz");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CurrentVoltage", Obj.CurrentVoltage, "name", "Current voltage, V");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Family", this._translate_processor_family(Obj.Family));
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaxClockSpeed", Obj.MaxClockSpeed, "name", "Maximum clock speed, MHz");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ProcessorId", Obj.ProcessorId, "name", "Processor ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ProcessorType", this._translate_processor_type(Obj.ProcessorType), "name", "Processor type");
    this._xmlCreateChildTextNode(xmlDoc, root, "Revision", Obj.Revision);
    this._xmlCreateChildTextNode(xmlDoc, root, "Role", Obj.Role);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SocketDesignation", Obj.SocketDesignation, "name", "Socket type");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
    this._xmlCreateChildTextNode(xmlDoc, root, "Version", Obj.Version);
  }

  this._collectBiosInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "IdentificationCode", Obj.IdentificationCode, "name", "Identification code");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ReleaseDate", this._translate_date(Obj.ReleaseDate), "name", "Release date");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
    this._xmlCreateChildTextNode(xmlDoc, root, "Version", Obj.Version);

    if(Obj.BiosCharacteristics != null)
    {
      var char_node = this._xmlCreateChildNodeWithAttribute(xmlDoc, root, "BIOSCharacteristics", "name", "BIOS Features");

      var i_count = 1;
      var chars_ar = Obj.BiosCharacteristics.toArray();
      var chars_en = new Enumerator(chars_ar);

      for (; !chars_en.atEnd(); chars_en.moveNext())
      {
        var ch_obj = chars_en.item();
        this._xmlCreateChildTextNodeWithAttribute(xmlDoc, char_node, "Characteristic_" + String(i_count), this._translate_bios_feats(ch_obj), "name", "Feature " + String(i_count));

        i_count++;
      }
    }
  }

  this._collectVideoAdapterInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "AdapterDACType", Obj.AdapterDACType, "name", "Adapter DAC type");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "AdapterRAM", Obj.AdapterRAM, "name", "Ammount of onboard RAM, bytes");
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CurrentRefreshRate", Obj.CurrentRefreshRate, "name", "Current refresh rate, Hz");
    this._xmlCreateChildTextNode(xmlDoc, root, "Description", Obj.Description);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DriverDate", this._translate_date(Obj.DriverDate), "name", "Driver date");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DriverVersion", Obj.DriverVersion, "name", "Driver version");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaxRefreshRate", Obj.MaxRefreshRate, "name", "Maximum refresh rate, Hz");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MinRefreshRate", Obj.MinRefreshRate, "name", "Minimum refresh rate, Hz");
    this._xmlCreateChildTextNode(xmlDoc, root, "Monochrome", Obj.Monochrome);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ProtocolSupported", this._translate_protocol_supported(Obj.ProtocolSupported), "name", "Protocol supported");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "VideoArchitecture", this._translate_video_architecture(Obj.VideoArchitecture), "name", "Video architecture");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "VideoMemoryType", this._translate_video_memory_type(Obj.VideoMemoryType), "name", "Video memory type");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "VideoModeDescription", Obj.VideoModeDescription, "name", "Video mode description");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "VideoProcessor", Obj.VideoProcessor, "name", "Video processor");
  }

  this._collectSoundInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ProductName", Obj.ProductName, "name", "Product name");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectMemoryInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BankLabel", Obj.BankLabel, "name", "Bank label");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Capacity", Obj.Capacity, "name", "Capacity, bytes");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "FormFactor", this._translate_memory_form_factor(Obj.FormFactor), "name", "Form factor");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "HotSwappable", Obj.HotSwappable, "name", "Is hot-swappable?");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MemoryType", this._translate_memory_type(Obj.MemoryType), "name", "Memory type");
    this._xmlCreateChildTextNode(xmlDoc, root, "Model", Obj.Model);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SerialNumber", Obj.SerialNumber, "name", "Serial number");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Speed", Obj.Speed, "name", "Speed, MHz");
  }

  this._collectPortConnectorsInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "InternalReferenceDesignator", Obj.InternalReferenceDesignator, "name", "Internal name");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PoweredOn", String(Obj.PoweredOn), "name", "Is powered on?");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectUsbControllerInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectIdeControllerInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNode(xmlDoc, root, "Caption", Obj.Caption);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaxNumberControlled", Obj.MaxNumberControlled, "name", "Maximum number of directly addressable devices supported");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ProtocolSupported", this._translate_protocol_supported(Obj.ProtocolSupported), "name", "Protocol supported");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectScsiControllerInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNode(xmlDoc, root, "Caption", Obj.Caption);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DriverName", Obj.DriverName, "name", "Driver name");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "HardwareVersion", Obj.HardwareVersion, "name", "Hardware version");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaxTransferRate", Obj.MaxTransferRate, "name", "Maximum transfer rate, bits per second");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ProtectionManagement", this._translate_scsi_protection_management(Obj.ProtectionManagement), "name", "Protecton management");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ProtocolSupported", this._translate_protocol_supported(Obj.ProtocolSupported), "name", "Protocol supported");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collect1394ControllerInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectSerialPortInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaxBaudRate", Obj.MaxBaudRate, "name", "Maximum baud rate, bits per second");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ProtocolSupported", this._translate_protocol_supported(Obj.ProtocolSupported), "name", "Protocol supported");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ProviderType", Obj.ProviderType, "name", "Provider type");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectParallelPortInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectIrDeviceInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectPcmciaControllerInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectNetworkAdapterInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "AdapterType", Obj.AdapterType, "name", "Adapter type");
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNode(xmlDoc, root, "Caption", Obj.Caption);

    var nc = new Enumerator(this._ExecQueryWithWhereClause("Win32_NetworkAdapterConfiguration", "Index=" + Obj.Index));
    for (; !nc.atEnd(); nc.moveNext())
    {
      var conf_obj = nc.item();
      var conf_node = this._xmlCreateChildNodeWithAttribute(xmlDoc, root, "Configuration", "name", "Adapter configuration:");

      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "DatabasePath", conf_obj.DatabasePath, "name", "Path to standard Internet database files");

      if(conf_obj.DefaultIPGateway != null)
      {
        var gate_node = this._xmlCreateChildNodeWithAttribute(xmlDoc, conf_node, "DefaultIPGateways", "name", "Default IP gateways:");

        var i_count = 1;
        var dips = conf_obj.DefaultIPGateway.toArray();
        var dipc = new Enumerator(dips);

        for (; !dipc.atEnd(); dipc.moveNext())
        {
          var dip_obj = dipc.item();
          this._xmlCreateChildTextNode(xmlDoc, gate_node, "DefaultIPGateway_" + String(i_count), String(dip_obj));

          i_count++;
        }
      }

      this._xmlCreateChildTextNode(xmlDoc, conf_node, "Description", conf_obj.Description);
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "DHCPEnabled", conf_obj.DHCPEnabled, "name", "DHCP enabled");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "DHCPLeaseExpires", this._translate_date(conf_obj.DHCPLeaseExpires), "name", "DHCP lease expires");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "DHCPLeaseObtained", this._translate_date(conf_obj.DHCPLeaseObtained), "name", "DHCP lease obtained");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "DHCPServer", conf_obj.DHCPServer, "name", "DHCP server");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "DNSDomain", conf_obj.DNSDomain, "name", "DNS domain");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "DNSEnabledForWINSResolution", conf_obj.DNSEnabledForWINSResolution, "name", "DNS enabled for WINS resolution");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "DNSHostName", conf_obj.DNSHostName, "name", "DNS host name");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "IPEnabled", conf_obj.IPEnabled, "name", "IP enabled");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "IPFilterSecurityEnabled", conf_obj.IPFilterSecurityEnabled, "name", "IP packet filtering enabled");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "IPPortSecurityEnabled", conf_obj.IPPortSecurityEnabled, "name", "IP port security enabled");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "IPUseZeroBroadcast", conf_obj.IPUseZeroBroadcast, "name", "IP uses zero broadcast");

      if(conf_obj.IPXEnabled == true)
        this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "IPXAddress", conf_obj.IPXAddress, "name", "IPX address");

      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "IPXEnabled", conf_obj.IPXEnabled, "name", "IPX enabled");

      if((Obj.ServiceName == "") | (Obj.ServiceName == undefined) | (Obj.ServiceName == "null"))
        this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "ServiceName", conf_obj.ServiceName, "name", "Service name of the network adapter");

      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "TcpipNetbiosOptions", conf_obj.TcpipNetbiosOptions, "name", "NetBIOS over TCP/IP");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "TcpNumConnections", conf_obj.TcpNumConnections, "name", "Maximum Number of connections");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "WINSEnableLMHostsLookup", conf_obj.WINSEnableLMHostsLookup, "name", "Local lookup files are used for WINS resoluton");

      if(conf_obj.WINSEnableLMHostsLookup == true)
        this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "WINSHostLookupFile", conf_obj.WINSHostLookupFile, "name", "Lookup file path");

      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "WINSPrimaryServer", conf_obj.WINSPrimaryServer, "name", "WINS primary server");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, conf_node, "WINSSecondaryServer", conf_obj.WINSSecondaryServer, "name", "WINS secondary server");

      if(conf_obj.IPAddress != null)
      {
        var addr_node = this._xmlCreateChildNodeWithAttribute(xmlDoc, conf_node, "IPAddresses", "name", "IP addresses:");

        var i_count = 1;
        var ips = conf_obj.IPAddress.toArray();
        var ipc = new Enumerator(ips);

        for (; !ipc.atEnd(); ipc.moveNext())
        {
          var ip_obj = ipc.item();
          this._xmlCreateChildTextNodeWithAttribute(xmlDoc, addr_node, "Ip" + String(i_count), String(ip_obj), "name", "IP Address " + String(i_count));

          i_count++;
        }
      }

      if(conf_obj.IPSubnet != null)
      {
        var subnet_node = this._xmlCreateChildNodeWithAttribute(xmlDoc, conf_node, "IPSubnetMasks", "name", "IP subnet masks:");

        var i_count = 1;
        var ipss = conf_obj.IPSubnet.toArray();
        var ipsc = new Enumerator(ipss);

        for (; !ipsc.atEnd(); ipsc.moveNext())
        {
          var ips_obj = ipsc.item();
          this._xmlCreateChildTextNodeWithAttribute(xmlDoc, subnet_node , "Mask" + String(i_count), String(ips_obj), "name", "Subnet mask " + String(i_count));

          i_count++;
        }
      }
    }

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MACAddress", Obj.MACAddress, "name", "MAC address");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaxSpeed", Obj.MaxSpeed, "name", "Maximum transfer speed, bits per second");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "NetConnectionID", Obj.NetConnectionID, "name", "Name of network connection");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "NetConnectionStatus", this._translate_net_connection_status(Obj.NetConnectionStatus), "name", "Status of the network connection");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ServiceName", Obj.ServiceName, "name", "Service name of the network adapter");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Speed", Obj.Speed, "name", "Current transfer speed, bits per second");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectDisplayInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DisplayType", Obj.DisplayType, "name", "Display type");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MonitorManufacturer", Obj.MonitorManufacturer, "name", "Manufacturer");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MonitorType", Obj.MonitorType, "name", "Monitor type");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PixelsPerXLogicalInch", Obj.PixelsPerXLogicalInch, "name", "Resolution along the X axis, pixels per inch");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PixelsPerYLogicalInch", Obj.PixelsPerYLogicalInch, "name", "Resolution along the Y axis, pixels per inch");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ScreenHeight", Obj.ScreenHeight, "name", "Logical height of the display, pixels");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ScreenWidth", Obj.ScreenWidth, "name", "Logical width of the display, pixels");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectCDROMInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Drive", Obj.Drive);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DriveIntegrity", Obj.DriveIntegrity, "name", "Files can be accurately read from the CD device");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaxMediaSize", Obj.MaxMediaSize, "name", "Maximum media size supported, kilobytes");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MediaType", Obj.MediaType, "name", "Media type");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNode(xmlDoc, root, "Size", Obj.Size);
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectDiskDrivesInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BytesPerSector", Obj.BytesPerSector, "name", "Bytes per sector");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Index", Obj.Index);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "InterfaceType", Obj.InterfaceType, "name", "Interface type");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaxMediaSize", Obj.MaxMediaSize, "name", "Maximum media size supported, kilobytes");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MediaType", Obj.MediaType, "name", "Media type");
    this._xmlCreateChildTextNode(xmlDoc, root, "Model", Obj.Model);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Size", Obj.Size, "name", "Capacity, bytes");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectFloppyInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectTapeDriveInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Compression", this._translate_true_false(Obj.Compression), "name", "Hardware data compression is enabled");

    if(Obj.Compression == 1)
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CompressionMethod", Obj.CompressionMethod, "name", "Algorithm or tool used by the device to support compression");

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ECC", this._translate_true_false(Obj.ECC), "name", "Device supports hardware error correction");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ErrorMethodology", Obj.ErrorMethodology, "name", "Type of error detection and correction supported by device");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "FeaturesHigh", Obj.FeaturesHigh, "name", "High-order 32 bits of the device features flag");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "FeaturesLow", Obj.FeaturesLow, "name", "Low-order 32 bits of the device features flag");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Id", Obj.Id, "name", "Identifying name");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaxMediaSize", Obj.MaxMediaSize, "name", "Maximum size, in kilobytes, of media supported by device");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MediaType", Obj.MediaType, "name", "Media type used by (or accessed by) this device");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "NumberOfMediaSupported", Obj.NumberOfMediaSupported, "name", "Maximum number of individual media which can be supported or inserted in the media access device");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PNPDeviceID", Obj.PNPDeviceID, "name", "Windows Plug and Play device identifier");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ReportSetMarks", this._translate_true_false(Obj.ReportSetMarks), "name", "Setmark reporting is enabled");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);

    if(Obj.Capabilities != null)
    {
      var cap_node = this._xmlCreateChildNodeWithAttribute(xmlDoc, root, "Capabilities", "name", "Device capabilities:");

      var c_count = 1;
      var cps = Obj.Capabilities.toArray();
      var cpc = new Enumerator(cps);

      for (; !cpc.atEnd(); cpc.moveNext())
      {
        var cp_obj = cpc.item();
        this._xmlCreateChildTextNodeWithAttribute(xmlDoc, cap_node, "Cap" + String(c_count), this._translate_conseq_capabilities(cp_obj), "name", "Capability " + String(c_count));

        c_count++;
      }
    }
  }

  this._collectKeyboardInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Layout", Obj.Layout);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "NumberOfFunctionKeys", Obj.NumberOfFunctionKeys, "name", "Number of function keys");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectPointingDeviceInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceInterface", this._translate_mouse_interface(Obj.DeviceInterface), "name", "Device interface");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "HardwareType", Obj.HardwareType, "name", "Hardware type");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "NumberOfButtons", Obj.NumberOfButtons, "name", "Number of buttons");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PointingType", this._translate_mouse_type(Obj.PointingType), "name", "Pointing device type");
    this._xmlCreateChildTextNode(xmlDoc, root, "Resolution", Obj.Resolution);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SampleRate", Obj.SampleRate, "name", "Sampling rate, Hz");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectPrinterInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DriverName", Obj.DriverName, "name", "Driver name");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Network", Obj.Network, "name", "Is network printer?");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PortName", Obj.PortName, "name", "Port that is used to transmit data to a printer");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PrinterStatus", this._translate_printer_status(Obj.PrinterStatus), "name", "Status of printer");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PrintProcessor", Obj.PrintProcessor, "name", "Name of the print spooler that handles print jobs");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ServerName", Obj.ServerName, "name", "Name of the server that controls the printer");

    if(Obj.Attributes != null)
    {
      var attrib_node = this._xmlCreateChildNode(xmlDoc, root, "Attributes");

      if(Obj.Attributes & 0x1) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute1", "true", "name", "Print jobs are buffered and queued");
      if(Obj.Attributes & 0x2) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute2", "true", "name", "Document to be sent directly to the printer");
      if(Obj.Attributes & 0x4) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute3", "true", "name", "Default printer on a computer");
      if(Obj.Attributes & 0x8) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute4", "true", "name", "Available as a shared network resource");
      if(Obj.Attributes & 0x10) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute5", "true", "name", "Attached to a network");
      if(Obj.Attributes & 0x20) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute6", "true", "name", "Hidden from some users on the network");
      if(Obj.Attributes & 0x40) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute7", "true", "name", "Directly connected to a computer");
      if(Obj.Attributes & 0x80) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute8", "true", "name", "Enable the queue on the printer if available");
      if(Obj.Attributes & 0x100) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute9", "true", "name", "Spooler should not delete documents after they are printed");
      if(Obj.Attributes & 0x200) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute10", "true", "name", "Start jobs that are finished spooling first");
      if(Obj.Attributes & 0x400) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute11", "true", "name", "Queue print jobs when a printer is not available");
      if(Obj.Attributes & 0x800) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute12", "true", "name", "Enable bi-directional printing");
      if(Obj.Attributes & 0x1000) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute13", "true", "name", "Allow only raw data type jobs to be spooled");
      if(Obj.Attributes & 0x2000) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, attrib_node, "Attribute14", "true", "name", "Published in the network directory service");
    }

    var cc = new Enumerator(this._ExecQueryWithWhereClause("Win32_PrinterConfiguration", "Name=\"" + Obj.Name + "\""));
    for (cc.moveFirst(); !cc.atEnd(); cc.moveNext())
    {
      var conf_obj = cc.item();
      var config_node = this._xmlCreateChildNode(xmlDoc, root, "Configuration");

      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "Collate", conf_obj.Collate, "name", "Pages that are printed should be collated");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "Color", this._translate_print_color(conf_obj.Color), "name", "Color mode");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "DitherType", this._translate_print_dither_type(conf_obj.DitherType), "name", "Dither type of the printer");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "DriverVersion", conf_obj.DriverVersion, "name", "Version number of the printer driver");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "Duplex", conf_obj.Duplex, "name", "Printing is done on both sides");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "HorizontalResolution", conf_obj.HorizontalResolution, "name", "Print resolution along the X axis (width), dots per inch");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "VerticalResolution", conf_obj.VerticalResolution, "name", "Print resolution along the Y axis (height), dots per inch");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "ICMIntent", this._translate_print_icm_intent(conf_obj.ICMIntent), "name", "Color matching method");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "ICMMethod", this._translate_print_icm_method(conf_obj.ICMMethod), "name", "How ICM is handled");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "MediaType", this._translate_print_media_type(conf_obj.MediaType), "name", "Type of media being printed on");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "Orientation", this._translate_print_orientation(conf_obj.Orientation), "name", "Printing orientation of the paper");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "PaperSize", conf_obj.PaperSize, "name", "Size of the paper");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "Scale", conf_obj.Scale, "name", "Factor by which the printed output is to be scaled, %");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, config_node, "TTOption", this._translate_print_true_type_option(conf_obj.TTOption), "name", "How TrueType(r) fonts should be printed");
    }
  }

  this._collectBatteryInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BatteryRechargeTime", Obj.BatteryRechargeTime, "name", "Battery recharge time");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BatteryStatus", Obj.BatteryStatus, "name", "Status of battery");
    this._xmlCreateChildTextNode(xmlDoc, root, "Chemistry", Obj.Chemistry);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DesignCapacity", Obj.DesignCapacity, "name", "Design capacity");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DesignVoltage", Obj.DesignVoltage, "name", "Design voltage");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "EstimatedChargeRemaining", Obj.EstimatedChargeRemaining, "name", "Estimated time until battery is fully recharged");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "EstimatedRunTime", Obj.EstimatedRunTime, "name", "Estimate in minutes of the time to battery charge depletion");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ExpectedBatteryLife", Obj.ExpectedBatteryLife, "name", "Amount of time it takes to completely drain the battery after it has been fully charged");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ExpectedLife", Obj.ExpectedLife, "name", "Battery's expected lifetime");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "FullChargeCapacity", Obj.FullChargeCapacity, "name", "Full charge capacity");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaxRechargeTime", Obj.MaxRechargeTime, "name", "Maximum time, in minutes, to fully charge the battery");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "TimeOnBattery", Obj.TimeOnBattery, "name", "Elapsed time in seconds since UPS last switched to battery power");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "TimeToFullCharge", Obj.TimeToFullCharge, "name", "Remaining time to charge the battery fully");
  }

  this._collectPortableBatteryInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BatteryRechargeTime", Obj.BatteryRechargeTime, "name", "Battery recharge time");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BatteryStatus", Obj.BatteryStatus, "name", "Status of battery");
    this._xmlCreateChildTextNode(xmlDoc, root, "Chemistry", Obj.Chemistry);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DesignCapacity", Obj.DesignCapacity, "name", "Design capacity");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DesignVoltage", Obj.DesignVoltage, "name", "Design voltage");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "EstimatedChargeRemaining", Obj.EstimatedChargeRemaining, "name", "Estimated time until battery is fully recharged");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "EstimatedRunTime", Obj.EstimatedRunTime, "name", "Estimate in minutes of the time to battery charge depletion");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ExpectedBatteryLife", Obj.ExpectedBatteryLife, "name", "Amount of time it takes to completely drain the battery after it has been fully charged");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ExpectedLife", Obj.ExpectedLife, "name", "Battery's expected lifetime");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "FullChargeCapacity", Obj.FullChargeCapacity, "name", "Full charge capacity");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaxRechargeTime", Obj.MaxRechargeTime, "name", "Maximum time, in minutes, to fully charge the battery");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "TimeOnBattery", Obj.TimeOnBattery, "name", "Elapsed time in seconds since UPS last switched to battery power");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "TimeToFullCharge", Obj.TimeToFullCharge, "name", "Remaining time to charge the battery fully");
  }

  this._collectUPSInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BatteryInstalled", Obj.BatteryInstalled, "name", "Battery installed");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CanTurnOffRemotely", Obj.CanTurnOffRemotely, "name", "UPS can be turned off remotely");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "EstimatedChargeRemaining", Obj.EstimatedChargeRemaining, "name", "Estimated time until UPS's battery is fully recharged");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "EstimatedRunTime", Obj.EstimatedRunTime, "name", "Estimated time, in minutes, to battery/generator depletion");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "FirstMessageDelay", Obj.FirstMessageDelay, "name", "Length of time between initial power failure and the first message sent to users");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "IsSwitchingSupply", Obj.IsSwitchingSupply, "name", "UPS is a switching (as opposed to linear) supply");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "LowBatterySignal", Obj.LowBatterySignal, "name", "Has a low battery signal");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MessageInterval", Obj.MessageInterval, "name", "Length of time between messages sent to users");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PowerFailSignal", Obj.PowerFailSignal, "name", "UPS has a power failure signal");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "RemainingCapacityStatus", Obj.RemainingCapacityStatus, "name", "Capacity remaining in the UPS' batteries and generator");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "TimeOnBackup", Obj.TimeOnBackup, "name", "Elapsed time, in seconds, after the UPS last switched to battery power/generator/was restarted");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "TotalOutputPower", Obj.TotalOutputPower, "name", "Total output power of the UPS");

    if(Obj.IsSwitchingSupply == true)
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "TypeOfRangeSwitching", Obj.TypeOfRangeSwitching, "name", "Type of input voltage range switching implemented");

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "UPSPort", Obj.UPSPort, "name", "Name of the serial port to which the UPS is connected");
  }

  this._collectFanInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ActiveCooling", Obj.ActiveCooling, "name", "Device provides active cooling");
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PNPDeviceID", Obj.PNPDeviceID, "name", "Windows Plug and Play device identifier");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "VariableSpeed", Obj.VariableSpeed, "name", "Fan supports variable speeds");
  }

  this._collectHeatPipeInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ActiveCooling", Obj.ActiveCooling, "name", "Device provides active cooling");
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PNPDeviceID", Obj.PNPDeviceID, "name", "Windows Plug and Play device identifier");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectRefrigerationInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ActiveCooling", Obj.ActiveCooling, "name", "Device provides active cooling");
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PNPDeviceID", Obj.PNPDeviceID, "name", "Windows Plug and Play device identifier");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
  }

  this._collectPOTSModemInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "AnswerMode", this._translate_answer_mode(Obj.AnswerMode), "name", "Auto-answer/call-back setting for the modem");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "AttachedTo", Obj.AttachedTo, "name", "Port to which this modem is attached");
    this._xmlCreateChildTextNode(xmlDoc, root, "Availability", this._translate_availability(Obj.Availability));
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceID", Obj.DeviceID, "name", "Device ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DeviceType", Obj.DeviceType, "name", "Physical type of the modem");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DialType", this._translate_dial_tone(Obj.DialType), "name", "Type of dialing method used");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DriverDate", this._translate_date(Obj.DriverDate), "name", "Date of the modem driver");
    this._xmlCreateChildTextNode(xmlDoc, root, "Model", Obj.Model);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ModemInfPath", Obj.ModemInfPath, "name", "Path to this modem's .inf file");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PortSubClass", this._translate_modem_port(Obj.PortSubClass), "name", "Definition of the port used for this modem");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Prefix", Obj.Prefix, "name", "Dialing prefix used to access an outside line");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ProviderName", Obj.ProviderName, "name", "Provider name");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "RingsBeforeAnswer", Obj.RingsBeforeAnswer, "name", "Number of rings before the modem answers an incoming call");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StringFormat", Obj.StringFormat, "name", "Type of characters used for text passed through the modem");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SupportsCallback", Obj.SupportsCallback, "name", "Modem supports call-back");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "TimeOfLastReset", this._translate_date(Obj.TimeOfLastReset), "name", "Date and time the modem was last reset");

    if(Obj.CountriesSupported != null)
    {
      var cs_node = this._xmlCreateChildNodeWithAttribute(xmlDoc, root, "CountriesSupported", "name", "Countries supported:");

      var c_count = 1;
      var csps = Obj.CountriesSupported.toArray();
      var cspc = new Enumerator(csps);

      for (; !cspc.atEnd(); cspc.moveNext())
      {
        var cs_obj = cspc.item();
        this._xmlCreateChildTextNodeWithAttribute(xmlDoc, cs_node, "Country" + String(c_count), String(cs_obj), "name", "Country " + String(c_count));

        c_count++;
      }
    }
  }

  this._collectSystemEnclosureInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "AudibleAlarm", Obj.AudibleAlarm, "name", "Frame is equipped with an audible alarm");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CableManagementStrategy", Obj.CableManagementStrategy, "name", "How the various cables are connected and bundled for the frame");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "HeatGeneration", Obj.HeatGeneration, "name", "Amount of heat generated by the chassis, BTU/hour");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "LockPresent", Obj.LockPresent, "name", "Frame is protected with a lock");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNode(xmlDoc, root, "Model", Obj.Model);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "NumberOfPowerCords", Obj.NumberOfPowerCords, "name", "Number of power cords which must be connected to the chassis, for all the components to operate");
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Tag", Obj.Tag, "name", "Unique identifier of the system enclosure");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "VisibleAlarm", Obj.VisibleAlarm, "name", "Equipment includes a visible alarm");

    if(Obj.ChassisTypes != null)
    {
      var ct_node = this._xmlCreateChildNodeWithAttribute(xmlDoc, root, "ChassisTypes", "name", "Chassis types:");

      var ct_count = 1;
      var ctps = Obj.ChassisTypes.toArray();
      var ctpc = new Enumerator(ctps);

      for (; !ctpc.atEnd(); ctpc.moveNext())
      {
        var ct_obj = ctpc.item();
        this._xmlCreateChildTextNodeWithAttribute(xmlDoc, ct_node, "ChassisType" + String(ct_count), this._translate_chassis_type(String(ct_obj)), "name", "Type " + String(ct_count));

        ct_count++;
      }
    }

    if(Obj.ServicePhilosophy != null)
    {
      var ct_node = this._xmlCreateChildNodeWithAttribute(xmlDoc, root, "ServicePhilosophy", "name", "Service philosophy:");

      var ct_count = 1;
      var ctps = Obj.ServicePhilosophy.toArray();
      var ctpc = new Enumerator(ctps);

      for (; !ctpc.atEnd(); ctpc.moveNext())
      {
        var ct_obj = ctpc.item();
        this._xmlCreateChildTextNodeWithAttribute(xmlDoc, ct_node, "ServiceType" + String(ct_count), this._translate_service_philosophy(String(ct_obj)), "name", "Service type " + String(ct_count));

        ct_count++;
      }
    }
  }

  // Software monitoring:

  this._collectUserInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "AccountType", this._translate_user_account_type(Obj.AccountType), "name", "Type of account");
    this._xmlCreateChildTextNode(xmlDoc, root, "Caption", Obj.Caption);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Disabled", Obj.Disabled, "name", "Is disabled?");
    this._xmlCreateChildTextNode(xmlDoc, root, "Domain", Obj.Domain);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "FullName", Obj.FullName, "name", "Full name");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "LocalAccount", Obj.LocalAccount, "name", "Is local account?");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Lockout", Obj.Lockout, "name", "Is locked out?");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PasswordChangeable", Obj.PasswordChangeable, "name", "Is password changeble on this account?");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PasswordExpires", Obj.PasswordExpires, "name", "Password expires on this account");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PasswordRequired", Obj.PasswordRequired, "name", "Password is required on this user account");
  }

  this._collectGroupInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Domain", Obj.Domain);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
  }

  this._collectLogonSessionInfo = function(Obj, xmlDoc, root)
  {
    try
    {
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "AuthenticationPackage", Obj.AuthenticationPackage, "name", "Authentication subsystem");
      this._xmlCreateChildTextNode(xmlDoc, root, "Caption", Obj.Caption);
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "LogonId", Obj.LogonId, "name", "Logon ID");
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "LogonType", this._translate_logon_type(Obj.LogonType), "name", "Type of logon");
      this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StartTime", this._translate_date(Obj.StartTime), "name", "Session started");
      this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
	}
	catch(e) { }
  }

  this._collectProductInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "IdentifyingNumber", Obj.IdentifyingNumber, "name", "Product ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "InstallLocation", Obj.InstallLocation, "name", "Product path");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "InstallState", this._translate_software_install_state(Obj.InstallState), "name", "Installed state of the product");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNode(xmlDoc, root, "Vendor", Obj.Vendor);
    this._xmlCreateChildTextNode(xmlDoc, root, "Version", Obj.Version);
  }

  this._collectCodecInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Description", Obj.Description);
    this._xmlCreateChildTextNode(xmlDoc, root, "InstallDate", this._translate_date(Obj.InstallDate));
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
    this._xmlCreateChildTextNode(xmlDoc, root, "Version", Obj.Version);
  }

  this._collectNetworkProtocolInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ConnectionlessService", Obj.ConnectionlessService, "name", "Protocol supports connectionless service");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "GuaranteesDelivery", Obj.GuaranteesDelivery, "name", "Protocol supports guaranteed delivery of data packets");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "GuaranteesSequencing", Obj.GuaranteesSequencing, "name", "Protocol guarantees sequencing");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MessageOriented", Obj.MessageOriented, "name", "Protocol is message-oriented");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SupportsBroadcasting", Obj.SupportsBroadcasting, "name", "Protocol supports broadcasting");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SupportsConnectData", Obj.SupportsConnectData, "name", "Protocol allows data to be connected across the network");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SupportsDisconnectData", Obj.SupportsDisconnectData, "name", "Protocol allows data to be disconnected across the network");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SupportsEncryption", Obj.SupportsEncryption, "name", "Protocol supports data encryption");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SupportsExpeditedData", Obj.SupportsExpeditedData, "name", "Protocol supports expedited (\"urgent\") data");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SupportsFragmentation", Obj.SupportsFragmentation, "name", "Protocol supports transmitting the data in fragments");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SupportsGracefulClosing", Obj.SupportsGracefulClosing, "name", "Protocol supports two-phase close operations");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SupportsGuaranteedBandwidth", Obj.SupportsGuaranteedBandwidth, "name", "Protocol has a mechanism to maintain a guaranteed bandwidth");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SupportsMulticasting", Obj.SupportsMulticasting, "name", "Protocol supports multicasting");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SupportsQualityofService", Obj.SupportsQualityofService, "name", "Protocol is capable of Quality of Service (QOS) support");
  }

  this._collectNetworkLoginProfileInfo = function(Obj, xmlDoc, root)
  {
    try
    {

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "AccountExpires", Obj.AccountExpires, "name", "Account expiration date");

    if((Obj.AuthorizationFlags != null) && (Obj.AuthorizationFlags != 0))
    {
      var aflags_node = this._xmlCreateChildNodeWithAttribute(xmlDoc, root, "AuthorizationFlags", "name", "Resources a user is authorized to use or modify");

      if(Obj.AuthorizationFlags & 0x1) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, aflags_node, "AuthFlag1", "true", "name", "Printer");
      if(Obj.AuthorizationFlags & 0x2) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, aflags_node, "AuthFlag2", "true", "name", "Communication");
      if(Obj.AuthorizationFlags & 0x4) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, aflags_node, "AuthFlag3", "true", "name", "Server");
      if(Obj.AuthorizationFlags & 0x8) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, aflags_node, "AuthFlag4", "true", "name", "Accounts");
    }

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BadPasswordCount", Obj.BadPasswordCount, "name", "Number of times the user entered a bad password when logging on");

    this._xmlCreateChildTextNode(xmlDoc, root, "Comment", Obj.Comment);
    this._xmlCreateChildTextNode(xmlDoc, root, "Description", Obj.Description);

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "FullName", Obj.FullName, "name", "Full name of the account");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "HomeDirectory", Obj.HomeDirectory, "name", "Path to the home directory of the user");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "HomeDirectoryDrive", Obj.HomeDirectoryDrive, "name", "Drive letter assigned to the user's home directory");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "LastLogoff", this._translate_date(Obj.LastLogoff), "name", "User last logged off the system (time of logoff)");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "LastLogon", this._translate_date(Obj.LastLogon), "name", "User last logged on to the system (time of logon)");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "LogonHours", Obj.LogonHours, "name", "Times during the week when the user can log on");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "LogonServer", Obj.LogonServer, "name", "Name of the server to which logon requests are sent");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaximumStorage", (Obj.MaximumStorage == 4294967295 ? "All available" : Obj.MaximumStorage), "name", "Maximum amount of disk space available to the user, bytes");

    if(this._isempty(Obj.FullName))
      this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Name", Obj.Name, "name", "Account name");

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "NumberOfLogons", Obj.NumberOfLogons, "name", "Number of successful logons");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PasswordAge", this._translate_pass_age(Obj.PasswordAge), "name", "Length of time a password has been in effect");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PasswordExpires", this._translate_date(Obj.PasswordExpires), "name", "Date/time when the password will expire");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PrimaryGroupId", Obj.PrimaryGroupId, "name", "Relative identifier (RID) of the Primary Global Group for this user");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Privileges", this._translate_privilege(Obj.Privileges), "name", "Level of privilege assigned");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Profile", Obj.Profile, "name", "Path to the user's profile");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ScriptPath", Obj.ScriptPath, "name", "Directory path to the user's logon script");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SettingID", Obj.SettingID, "name", "Setting ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "UnitsPerWeek", Obj.UnitsPerWeek, "name", "Number of time units the week is divided into");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "UserId", Obj.UserId, "name", "Relative identifier (RID) of the user");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "UserType", Obj.UserType, "name", "Type of account");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Workstations", Obj.Workstations, "name", "Names of workstations from which the user can log on");

    if(Obj.Flags != null)
    {
      var flags_node = this._xmlCreateChildNode(xmlDoc, root, "Flags");

      if(Obj.Flags & 0x1) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag1", "true", "name", "Logon Script Was Executed");
      if(Obj.Flags & 0x2) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag2", "true", "name", "Account Is Disabled");
      if(Obj.Flags & 0x8) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag3", "true", "name", "Home Directory Required");
      if(Obj.Flags & 0x10) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag4", "true", "name", "The Account Is Locked Out");
      if(Obj.Flags & 0x20) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag5", "true", "name", "Password Not Required");
      if(Obj.Flags & 0x40) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag6", "true", "name", "Password Can't Change");
      if(Obj.Flags & 0x80) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag7", "true", "name", "Encrypted Test Password Allowed");
      if(Obj.Flags & 0x100) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag8", "true", "name", "Temporary Duplicate Account");
      if(Obj.Flags & 0x200) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag9", "true", "name", "Normal Account");
      if(Obj.Flags & 0x800) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag10", "true", "name", "Interdomain Trust Account");
      if(Obj.Flags & 0x1000) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag11", "true", "name", "Workstation Trust Account");
      if(Obj.Flags & 0x2000) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag12", "true", "name", "Server Trust Account");
      if(Obj.Flags & 0x10000) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag13", "true", "name", "Don't Expire Password");
      if(Obj.Flags & 0x114240) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag14", "true", "name", "MNS Logon Account");
      if(Obj.Flags & 0x40000) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag15", "true", "name", "Smartcard Required");
      if(Obj.Flags & 0x80000) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag16", "true", "name", "Trusted For Delegation");
      if(Obj.Flags & 0x100000) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag17", "true", "name", "Not Delegated");
      if(Obj.Flags & 0x200000) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag18", "true", "name", "Use DES Key Only");
      if(Obj.Flags & 0x400000) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag19", "true", "name", "Don't Require Preauthorization");
      if(Obj.Flags & 0x800000) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, flags_node, "Flag20", "true", "name", "Password Expired");
    }

    }
	catch(e) { }
  }

  this._collectTimeInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Day", Obj.Day);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DayOfWeek", Obj.DayOfWeek, "name", "Day of week");
    this._xmlCreateChildTextNode(xmlDoc, root, "Hour", Obj.Hour);
    this._xmlCreateChildTextNode(xmlDoc, root, "Minute", Obj.Minute);
    this._xmlCreateChildTextNode(xmlDoc, root, "Month", Obj.Month);
    this._xmlCreateChildTextNode(xmlDoc, root, "Quarter", Obj.Quarter);
    this._xmlCreateChildTextNode(xmlDoc, root, "Second", Obj.Second);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "WeekInMonth", Obj.WeekInMonth, "name", "Week in month");
    this._xmlCreateChildTextNode(xmlDoc, root, "Year", Obj.Year);
  }

  this._collectTimeZoneInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Bias", Obj.Bias, "name", "Bias from UTC, minutes");
    this._xmlCreateChildTextNode(xmlDoc, root, "Caption", Obj.Caption);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DaylightBias", Obj.DaylightBias, "name", "Daylight saving time bias, minutes");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DaylightName", Obj.DaylightName, "name", "Daylight time zone name");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SettingID", Obj.SettingID, "name", "Setting ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StandardBias", Obj.StandardBias, "name", "Standard time bias, minutes");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StandardName", Obj.StandardName, "name", "Standard time zone name");

    // All other properties have been 'switched off' - too much space & too little use...
  /*
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DaylightDay", Obj.DaylightDay, "name", "DaylightDayOfWeek of the DaylightMonth when the transition from standard time to daylight saving time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DaylightDayOfWeek", Obj.DaylightDayOfWeek, "name", "Day of the week when the transition from standard time to daylight saving time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DaylightHour", Obj.DaylightHour, "name", "Hour of the day when the transition from standard time to daylight saving time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DaylightMillisecond", Obj.DaylightMillisecond, "name", "Millisecond of of the DaylightSecond when the transition from standard time to daylight saving time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DaylightMinute", Obj.DaylightMinute, "name", "Minute of the DaylightHour when the transition from standard time to daylight saving time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DaylightMonth", Obj.DaylightMonth, "name", "Month when the transition from standard time to daylight saving time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DaylightSecond", Obj.DaylightSecond, "name", "Second of of the DaylightMinute when the transition from standard time to daylight saving time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DaylightYear", Obj.DaylightYear, "name", "Year when daylight saving time is in effect (not required)");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StandardDay", Obj.StandardDay, "name", "StandardDayOfWeek of the StandardMonth when the transition from daylight saving time to standard time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StandardDayOfWeek", Obj.StandardDayOfWeek, "name", "Day of the week when the transition from daylight saving time to standard time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StandardHour", Obj.StandardHour, "name", "Hour of the day when the transition from daylight saving time to standard time occurs on this operating system.");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StandardMillisecond", Obj.StandardMillisecond, "name", "Millisecond of the StandardSecond when the transition from daylight saving time to standard time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StandardMinute", Obj.StandardMinute, "name", "Minute of the StandardDay when the transition from daylight saving time to standard time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StandardMonth", Obj.StandardMonth, "name", "Month when the transition from daylight saving time to standard time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StandardSecond", Obj.StandardSecond, "name", "Second of the StandardMinute when the transition from daylight saving time to standard time occurs on this operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StandardYear", Obj.StandardYear, "name", "Year when standard time is in effect (not required)");
  */
  }

  this._collectComputerSystemInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BootupState", Obj.BootupState, "name", "Bootup state");

    this._xmlCreateChildTextNode(xmlDoc, root, "Domain", Obj.Domain);

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DomainRole", this._translate_domain_role(Obj.DomainRole), "name", "Role of this computer in a domain");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "InfraredSupported", Obj.InfraredSupported, "name", "IR port exists on this computer");

    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);
    this._xmlCreateChildTextNode(xmlDoc, root, "Model", Obj.Model);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "NumberOfProcessors", Obj.NumberOfProcessors, "name", "Number of processors");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PowerManagementSupported", Obj.PowerManagementSupported, "name", "Computer can be power-managed");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PowerState", this._translate_power_state(Obj.PowerState), "name", "Current power state of a computer and its associated operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "PowerSupplyState", this._translate_power_supply_state(Obj.PowerSupplyState), "name", "State of the power supply or supplies when last booted");

    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SystemType", Obj.SystemType, "name", "Computer architecture");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ThermalState", this._translate_power_supply_state(Obj.ThermalState), "name", "Thermal state of the system when last booted");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "TotalPhysicalMemory", Obj.TotalPhysicalMemory, "name", "Ammount of physical memory installed, bytes");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "UserName", Obj.UserName, "name", "User currently logged on");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "WakeUpType", this._translate_wake_up(Obj.WakeUpType), "name", "Event that causes the system to power up");
  }

  this._collectOsInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BootDevice", Obj.BootDevice, "name", "Name of the disk drive from which this OS boots");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BuildNumber", Obj.BuildNumber, "name", "Build number");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BuildType", Obj.BuildType, "name", "Type of build used for this operating system");

    this._xmlCreateChildTextNode(xmlDoc, root, "Caption", Obj.Caption);

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CodeSet", Obj.CodeSet, "name", "Code page value in use");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CountryCode", Obj.CountryCode, "name", "Code for the country/region in use");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CurrentTimeZone", Obj.CurrentTimeZone, "name", "Number of minutes the operating system is offset from GMT");

    this._xmlCreateChildTextNode(xmlDoc, root, "Distributed", Obj.Distributed);

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ForegroundApplicationBoost", this._translate_application_boost(Obj.ForegroundApplicationBoost), "name", "Increase in priority given to the foreground application");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "FreePhysicalMemory", Obj.FreePhysicalMemory, "name", "Physical memory available, kilobytes");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "FreeVirtualMemory", Obj.FreeVirtualMemory, "name", "Virtual memory  available, kilobytes");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "LastBootUpTime", this._translate_date(Obj.LastBootUpTime), "name", "Date/time when the operating system was last booted");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "LocalDateTime", this._translate_date(Obj.LocalDateTime), "name", "Operating system's version of the local date and time of day (valid in the moment of query)");

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Locale", Obj.Locale, "name", "Language identifier in use");
    this._xmlCreateChildTextNode(xmlDoc, root, "Manufacturer", Obj.Manufacturer);

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "MaxNumberOfProcesses", (Obj.MaxNumberOfProcesses == -1 ? "Unlimited" : Obj.MaxNumberOfProcesses), "name", "Maximum number of processes the operating system can support");

    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "NumberOfLicensedUsers", (Obj.NumberOfLicensedUsers == 0 ? "Unlimited" : Obj.NumberOfLicensedUsers), "name", "Number of user licenses");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "NumberOfProcesses", Obj.NumberOfProcesses, "name", "Number of processes currently running");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "NumberOfUsers", Obj.NumberOfUsers, "name", "Current number of user sessions");

    this._xmlCreateChildTextNode(xmlDoc, root, "Organization", Obj.Organization);

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "OSLanguage", this._translate_language_of_os(Obj.OSLanguage), "name", "Language version");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "OSType", this._translate_type_of_os(Obj.OSType), "name", "Type of operating system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "RegisteredUser", Obj.RegisteredUser, "name", "Name of the registered user");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SerialNumber", Obj.SerialNumber, "name", "Serial identification number");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ServicePackMajorVersion", Obj.ServicePackMajorVersion, "name", "Service pack installed, major version number");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ServicePackMinorVersion", Obj.ServicePackMinorVersion, "name", "Service pack installed, minor version number");

    this._xmlCreateChildTextNode(xmlDoc, root, "Status", Obj.Status);

    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SystemDevice", Obj.SystemDevice, "name", "Physical disk partition on which the OS is installed");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SystemDirectory", Obj.SystemDirectory, "name", "System directory");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Version", Obj.Version, "name", "Version number");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "WindowsDirectory", Obj.WindowsDirectory, "name", "Windows directory");

    if(Obj.OSProductSuite != null)
    {
      var suite_node = this._xmlCreateChildNodeWithAttribute(xmlDoc, root, "OSProductSuite", "name", "Installed and licensed system product additions");

      if(Obj.OSProductSuite & 0x1) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, suite_node, "Suite1", "installed", "name", "Small Business");
      if(Obj.OSProductSuite & 0x2) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, suite_node, "Suite2", "installed", "name", "Enterprise");
      if(Obj.OSProductSuite & 0x4) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, suite_node, "Suite3", "installed", "name", "BackOffice");
      if(Obj.OSProductSuite & 0x8) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, suite_node, "Suite4", "installed", "name", "Communication Server");
      if(Obj.OSProductSuite & 0x10) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, suite_node, "Suite5", "installed", "name", "Terminal Server");
      if(Obj.OSProductSuite & 0x20) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, suite_node, "Suite6", "installed", "name", "Small Business (Restricted)");
      if(Obj.OSProductSuite & 0x40) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, suite_node, "Suite7", "installed", "name", "Embedded NT");
      if(Obj.OSProductSuite & 0x80) this._xmlCreateChildTextNodeWithAttribute(xmlDoc, suite_node, "Suite8", "installed", "name", "Data Center");
    }
  }

  this._collectOSRecoveryInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "AutoReboot", Obj.AutoReboot, "name", "Automatically reboot during a recovery operation");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DebugFilePath", Obj.DebugFilePath, "name", "Full path to the debug file");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DebugInfoType", this._translate_debug_info_type(Obj.DebugInfoType), "name", "Type of debugging information written to the log file");
    this._xmlCreateChildTextNode(xmlDoc, root, "Description", Obj.Description);
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "OverwriteExistingDebugFile", Obj.OverwriteExistingDebugFile, "name", "New log file will overwrite an existing one");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SendAdminAlert", Obj.SendAdminAlert, "name", "Alert message will be sent to the system administrator");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SettingID", Obj.SettingID, "name", "Seting ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "WriteDebugInfo", Obj.WriteDebugInfo, "name", "Debugging information is to be written to a log file");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "WriteToSystemLog", Obj.WriteToSystemLog, "name", "Events will be written to a system log");
  }

  this._collectOSBootInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "BootDirectory", Obj.BootDirectory, "name", "Path to the system files required for booting the system");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ConfigurationPath", Obj.ConfigurationPath, "name", "Path to the configuration files");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Name", Obj.Name, "name", "Name of this configuration");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ScratchDirectory", Obj.ScratchDirectory, "name", "Directory where temporary files can reside during boot time");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "SettingID", Obj.SettingID, "name", "Setting ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "TempDirectory", Obj.TempDirectory, "name", "Directory where temporary files are stored");
  }

  this._collectQFEInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNode(xmlDoc, root, "Description", Obj.Description);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "FixComments", Obj.FixComments, "name", "Comments");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "HotFixID", Obj.HotFixID, "name", "Hotfix ID");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "InstallDate", this._translate_date(Obj.InstallDate), "name", "Date when hotfix was installed");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "InstalledBy", Obj.InstalledBy, "name", "Person who installed the update");
    this._xmlCreateChildTextNode(xmlDoc, root, "Name", Obj.Name);
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ServicePackInEffect", Obj.ServicePackInEffect, "name", "Service pack in effect when the update was applied");
  }

  this._collectODBCDataSourceInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CheckID", Obj.CheckID, "name", "Unique data source identifier");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DataSource", Obj.DataSource, "name", "Token name for this data source");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "DriverDescription", Obj.DriverDescription, "name", "Name of associated ODBC driver");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Registration", this._translate_odbc_registraton(Obj.Registration), "name", "Type of registration");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Version", Obj.Version, "name", "Version");
  }

  this._collectODBCDriverInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CheckID", Obj.CheckID, "name", "Unique driver identifier");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Driver", Obj.Driver, "name", "Token name for this driver");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Version", Obj.Version, "name", "Version");
  }

  this._collectODBCTranslatorInfo = function(Obj, xmlDoc, root)
  {
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "CheckID", Obj.CheckID, "name", "Unique translator identifier");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Translator", Obj.Translator, "name", "Token name for this translator");
    this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "Version", Obj.Version, "name", "Version");
  }

  this._collectPingData = function(ip)
  {
    var locator = new ActiveXObject("WbemScripting.SWbemLocator");

    var local_service = locator.ConnectServer("", "root\\cimv2");
    local_service.Security_.ImpersonationLevel = 3; // == Impersonate

    // WinXP/2003Server only!
    var fc = new Enumerator(local_service.ExecQuery("Select * from Win32_PingStatus where Address = '" + ip + "'"));

    var xmlDoc = null, colItem = null, numItems = 0;

    for (; !fc.atEnd(); fc.moveNext())
      numItems++;

    if(numItems > 0)
    {
      xmlDoc = new ActiveXObject("Msxml2.DOMDocument");

      if(numItems > 1)
      {
        colItem = xmlDoc.createElement("Item");
        xmlDoc.appendChild(colItem);
        this._xmlSetAttribute(xmlDoc, colItem, "name", "Ping Data Sets");
      }

      var i = 1;
      for (fc.moveFirst(); !fc.atEnd(); fc.moveNext())
      {
        var Obj = fc.item();

        var root, num = "";
        if(colItem)
        {
          root = xmlDoc.createElement("Element");
          num = " " + String(i);
        }
        else
        {
          root = xmlDoc.createElement("Item");
        }

        this._xmlSetAttribute(xmlDoc, root, "name", "Ping Data" + num);
        if(colItem)
        {
          colItem.appendChild(root);
        }
        else
        {
          xmlDoc.appendChild(root);
        }

        this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "ResponseTime", Obj.ResponseTime, "name", "Response time");
        this._xmlCreateChildTextNodeWithAttribute(xmlDoc, root, "StatusCode", Obj.StatusCode, "name", "Status code returned");

        i++;
      }
    }

    return xmlDoc;
  }

  // Code translation routines:

  this._translate_date = function(date_code)
  {
    var date_str = String(date_code);

    if(this._isempty(date_str)) return "";

    var any_numbers = false;
    for(var i = 0; i < date_str.length; i++)
    {
      if(!isNaN(parseInt(date_str.charAt(i))))
      {
        any_numbers = true;
        break;
      }
    }

    if(!any_numbers) return "";

    return date_str.substring(4, 6)+"/"+date_str.substring(6, 8)+"/"+date_str.substring(0, 4)+", "+date_str.substring(8, 10)+":"+date_str.substring(10, 12)+":"+date_str.substring(12, 14);
  }

  this._translate_availability = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2: return "Unknown (" + String(code) + ")";
      case 3: return "Running / Full Power";
      case 4: return "Warning";
      case 5: return "In Test";
      case 6: return "Not Applicable";
      case 7: return "Power Off";
      case 8: return "Off Line";
      case 9: return "Off Duty";
      case 10: return "Degraded";
      case 11: return "Not Installed";
      case 12: return "Install Error";
      case 13: return "Power Save - Unknown";
      case 14: return "Power Save - Low Power Mode";
      case 15: return "Power Save - Standby";
      case 16: return "Power Cycle";
      case 17: return "Power Save - Warning";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_bios_feats = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2: return "Unknown (" + String(code) + ")";
      case 3: return "BIOS Characteristics Not Supported";
      case 4: return "ISA is supported";
      case 5: return "MCA is supported";
      case 6: return "EISA is supported";
      case 7: return "PCI is supported";
      case 8: return "PC Card (PCMCIA) is supported";
      case 9: return "Plug and Play is supported";
      case 10: return "APM is supported";
      case 11: return "BIOS is Upgradable (Flash)";
      case 12: return "BIOS shadowing is allowed";
      case 13: return "VL-VESA is supported";
      case 14: return "ESCD support is available";
      case 15: return "Boot from CD is supported";
      case 16: return "Selectable Boot is supported";
      case 17: return "BIOS ROM is socketed";
      case 18: return "Boot From PC Card (PCMCIA) is supported";
      case 19: return "EDD (Enhanced Disk Drive) Specification is supported";
      case 20: return "Int 13h - Japanese Floppy for NEC 9800 1.2mb (3.5, 1k Bytes/Sector, 360 RPM) is supported";
      case 21: return "Int 13h - Japanese Floppy for Toshiba 1.2mb (3.5, 360 RPM) is supported";
      case 22: return "Int 13h - 5.25 / 360 KB Floppy Services are supported";
      case 23: return "Int 13h - 5.25 /1.2MB Floppy Services are supported";
      case 24: return "Int 13h - 3.5 / 720 KB Floppy Services are supported";
      case 25: return "Int 13h - 3.5 / 2.88 MB Floppy Services are supported";
      case 26: return "Int 5h, Print Screen Service is supported";
      case 27: return "Int 9h, 8042 Keyboard services are supported";
      case 28: return "Int 14h, Serial Services are supported";
      case 29: return "Int 17h, printer services are supported";
      case 30: return "Int 10h, CGA/Mono Video Services are supported";
      case 31: return "NEC PC-98";
      case 32: return "ACPI supported";
      case 33: return "USB Legacy is supported";
      case 34: return "AGP is supported";
      case 35: return "I2O boot is supported";
      case 36: return "LS-120 boot is supported";
      case 37: return "ATAPI ZIP Drive boot is supported";
      case 38: return "1394 boot is supported";
      case 39: return "Smart Battery supported";

      default: return "Reserved (" + String(code) + ")";
    }
  }

  this._translate_processor_architecture = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 0: return "x86";
      case 1: return "MIPS";
      case 2: return "Alpha";
      case 3: return "PowerPC";
      case 6: return "Intel Itanium Processor Family";
      case 9: return "x64";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_processor_status = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "CPU Enabled";
      case 2: return "CPU Disabled by User via BIOS Setup";
      case 3: return "CPU Disabled By BIOS (POST Error)";
      case 4: return "CPU is Idle";
      case 5:
      case 6: return "Reserved (" + String(code) + ")";
      case 7: return "Other (" + String(code) + ")";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_processor_family = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2: return "Unknown (" + String(code) + ")";
      case 3: return "8086";
      case 4: return "80286";
      case 5: return "Intel386 processor";
      case 6: return "Intel486 processor";
      case 7: return "8087";
      case 8: return "80287";
      case 9: return "80387";
      case 10: return "80487";
      case 11: return "Pentium brand";
      case 12: return "Pentium Pro";
      case 13: return "Pentium II";
      case 14: return "Pentium MMX";
      case 15: return "Celeron";
      case 16: return "Pentium II Xeon";
      case 17: return "Pentium III";
      case 18: return "M1 Family";
      case 19: return "M2 Family";
      case 24: return "AMD Duron Processor Family";
      case 25: return "K5 Family";
      case 26: return "K6 Family";
      case 27: return "K6-2";
      case 28: return "K6-3";
      case 29: return "AMD Athlon Processor Family";
      case 30: return "AMD2900 Family";
      case 31: return "K6-2+";
      case 32: return "Power PC Family";
      case 33: return "Power PC 601";
      case 34: return "Power PC 603";
      case 35: return "Power PC 603+";
      case 36: return "Power PC 604";
      case 37: return "Power PC 620";
      case 38: return "Power PC X704";
      case 39: return "Power PC 750";
      case 48: return "Alpha Family";
      case 49: return "Alpha 21064";
      case 50: return "Alpha 21066";
      case 51: return "Alpha 21164";
      case 52: return "Alpha 21164PC";
      case 53: return "Alpha 21164a";
      case 54: return "Alpha 21264";
      case 55: return "Alpha 21364";
      case 64: return "MIPS Family";
      case 65: return "MIPS R4000";
      case 66: return "MIPS R4200";
      case 67: return "MIPS R4400";
      case 68: return "MIPS R4600";
      case 69: return "MIPS R10000";
      case 80: return "SPARC Family";
      case 81: return "SuperSPARC";
      case 82: return "microSPARC II";
      case 83: return "microSPARC IIep";
      case 84: return "UltraSPARC";
      case 85: return "UltraSPARC II";
      case 86: return "UltraSPARC IIi";
      case 87: return "UltraSPARC III";
      case 88: return "UltraSPARC IIIi";
      case 96: return "68040";
      case 97: return "68xxx Family";
      case 98: return "68000";
      case 99: return "68010";
      case 100: return "68020";
      case 101: return "68030";
      case 112: return "Hobbit Family";
      case 120: return "Crusoe TM5000 Family";
      case 121: return "Crusoe TM3000 Family";
      case 122: return "Efficeon TM8000 Family";
      case 128: return "Weitek";
      case 130: return "Itanium Processor";
      case 131: return "AMD Athlon 64 Processor Famiily";
      case 132: return "AMD Opteron Processor Family";
      case 144: return "PA-RISC Family";
      case 145: return "PA-RISC 8500";
      case 146: return "PA-RISC 8000";
      case 147: return "PA-RISC 7300LC";
      case 148: return "PA-RISC 7200";
      case 149: return "PA-RISC 7100LC";
      case 150: return "PA-RISC 7100";
      case 160: return "V30 Family";
      case 176: return "Pentium III Xeon processor";
      case 177: return "Pentium III Processor with Intel SpeedStep Technology";
      case 178: return "Pentium 4";
      case 179: return "Intel Xeon";
      case 180: return "AS400 Family";
      case 181: return "Intel Xeon processor MP";
      case 182: return "AMD Athlon XP Family";
      case 183: return "AMD Athlon MP Family";
      case 184: return "Intel Itanium 2";
      case 185: return "Intel Pentium M Processor";
      case 190: return "K7";
      case 200: return "IBM390 Family";
      case 201: return "G4";
      case 202: return "G5";
      case 203: return "G6";
      case 204: return "z/Architecture base";
      case 250: return "i860";
      case 251: return "i960";
      case 260: return "SH-3";
      case 261: return "SH-4";
      case 280: return "ARM";
      case 281: return "StrongARM";
      case 300: return "6x86";
      case 301: return "MediaGX";
      case 302: return "MII";
      case 320: return "WinChip";
      case 350: return "DSP";
      case 500: return "Video Processor";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_processor_type = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2: return "Unknown (" + String(code) + ")";
      case 3: return "Central Processor";
      case 4: return "Math Processor";
      case 5: return "DSP Processor";
      case 6: return "Video Processor";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_memory_form_factor = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 0: return "Unknown (" + String(code) + ")";
      case 2: return "SIP";
      case 3: return "DIP";
      case 4: return "ZIP";
      case 5: return "SOJ";
      case 6: return "Proprietary";
      case 7: return "SIMM";
      case 8: return "DIMM";
      case 9: return "TSOP";
      case 10: return "PGA";
      case 11: return "RIMM";
      case 12: return "SODIMM";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_memory_type = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 0: return "Unknown (" + String(code) + ")";
      case 2: return "DRAM";
      case 3: return "Synchronous DRAM"; break;
      case 4: return "Cache DRAM";
      case 5: return "EDO";
      case 6: return "EDRAM";
      case 7: return "VRAM";
      case 8: return "SRAM";
      case 9: return "RAM";
      case 10: return "ROM";
      case 11: return "Flash";
      case 12: return "EEPROM";
      case 13: return "FEPROM";
      case 14: return "EPROM";
      case 15: return "CDRAM";
      case 16: return "3DRAM";
      case 17: return "SDRAM";
      case 18: return "SGRAM";
      case 19: return "RDRAM";
      case 20: return "DDR";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_video_memory_type = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2: return "Unknown (" + String(code) + ")";
      case 3: return "VRAM";
      case 4: return "DRAM";
      case 5: return "SRAM";
      case 6: return "WRAM";
      case 7: return "EDO RAM";
      case 8: return "Burst Synchronous DRAM";
      case 9: return "Pipelined Burst SRAM";
      case 10: return "CDRAM";
      case 11: return "3DRAM";
      case 12: return "SDRAM";
      case 13: return "SGRAM";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_scsi_protection_management = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2: return "Unknown (" + String(code) + ")";
      case 3: return "Unprotected";
      case 4: return "Protected";
      case 5: return "Protected through SCC (SCSI-3 Controller Command)";
      case 6: return "Protected through SCC-2 (SCSI-3 Controller Command)";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_protocol_supported = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2: return "Unknown (" + String(code) + ")";
      case 3: return "EISA";
      case 4: return "ISA";
      case 5: return "PCI";
      case 6: return "ATA/ATAPI";
      case 7: return "Flexible Diskette";
      case 8: return "1496";
      case 9: return "SCSI Parallel Interface";
      case 10: return "SCSI Fibre Channel Protocol";
      case 11: return "SCSI Serial Bus Protocol";
      case 12: return "SCSI Serial Bus Protocol-2 (1394)";
      case 13: return "SCSI Serial Storage Architecture";
      case 14: return "VESA";
      case 15: return "PCMCIA";
      case 16: return "Universal Serial Bus";
      case 17: return "Parallel Protocol";
      case 18: return "ESCON";
      case 19: return "Diagnostic";
      case 20: return "I2C";
      case 21: return "Power";
      case 22: return "HIPPI";
      case 23: return "MultiBus";
      case 24: return "VME";
      case 25: return "IPI";
      case 26: return "IEEE-488";
      case 27: return "RS232";
      case 28: return "IEEE 802.3 10BASE5";
      case 29: return "IEEE 802.3 10BASE2";
      case 30: return "IEEE 802.3 1BASE5";
      case 31: return "IEEE 802.3 10BROAD36";
      case 32: return "IEEE 802.3 100BASEVG";
      case 33: return "IEEE 802.5 Token-Ring";
      case 34: return "ANSI X3T9.5 FDDI";
      case 35: return "MCA";
      case 36: return "ESDI";
      case 37: return "IDE";
      case 38: return "CMD";
      case 39: return "ST506";
      case 40: return "DSSI";
      case 41: return "QIC2";
      case 42: return "Enhanced ATA/IDE";
      case 43: return "AGP";
      case 44: return "TWIRP (two-way infrared)";
      case 45: return "FIR (fast infrared)";
      case 46: return "SIR (serial infrared)";
      case 47: return "IrBus";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_net_connection_status = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 0: return "Disconnected";
      case 1: return "Connecting";
      case 2: return "Connected";
      case 3: return "Disconnecting";
      case 4: return "Hardware not present";
      case 5: return "Hardware disabled";
      case 6: return "Hardware malfunction";
      case 7: return "Media disconnected";
      case 8: return "Authenticating";
      case 9: return "Authentication succeeded";
      case 10: return "Authentication failed";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_video_architecture = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2: return "Unknown (" + String(code) + ")";
      case 3: return "CGA";
      case 4: return "EGA";
      case 5: return "VGA";
      case 6: return "SVGA";
      case 7: return "MDA";
      case 8: return "HGC";
      case 9: return "MCGA";
      case 10: return "8514A";
      case 11: return "XGA";
      case 12: return "Linear Frame Buffer";
      case 160: return "PC-98";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_mouse_interface = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2: return "Unknown (" + String(code) + ")";
      case 3: return "Serial";
      case 4: return "PS/2";
      case 5: return "Infrared";
      case 6: return "HP-HIL";
      case 7: return "Bus mouse";
      case 8: return "ADB (Apple Desktop Bus)";
      case 160: return "Bus mouse DB-9";
      case 161: return "Bus mouse micro-DIN";
      case 162: return "USB";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_mouse_type = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2: return "Unknown (" + String(code) + ")";
      case 3: return "Mouse";
      case 4: return "Track Ball";
      case 5: return "Track Point";
      case 6: return "Glide Point";
      case 7: return "Touch Pad";
      case 8: return "Touch Screen";
      case 9: return "Mouse - Optical Sensor";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_printer_status = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2: return "Unknown (" + String(code) + ")";
      case 3: return "Idle";
      case 4: return "Printing";
      case 5: return "Warmup";
      case 6: return "Stopped printing";
      case 7: return "Offline";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_software_install_state = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case -6: return "Bad Configuration";
      case -2: return "Invalid Argument";
      case -1: return "Unknown Package";
      case 1: return "Advertised";
      case 2: return "Absent";
      case 5: return "Installed";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_logon_type = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2:
      case "Interactive":
        return "Interactive user logon (incl. terminal server/remote shell sessions)";

      case 3:
      case "Network":
        return "Used by high performance servers to authenticate clear text passwords";

      case 4:
      case "Batch":
        return "Batch server/high performance (mail or web) server logon";

      case 5:
      case "Service":
        return "Service-type logon";

      case 6:
      case "Proxy":
        return "Proxy-type logon";

      case 7:
      case "Unlock":
        return "Intended for GINA DLLs logging on users who will be interactively using the machine (audit-related)";

      case 8:
      case "NetworkCleartext":
        return "(Windows 2000/XP/.NET Server 2003 family) Preserves the name and password in the authentication packages, allowing the server to make connections to other network servers while impersonating the client";

      case 9:
      case "NewCredentials":
        return "(Windows 2000/XP/.NET Server 2003 family) Allows the caller to clone its current token and specify new credentials for outbound connections";

      case 10:
      case "RemoteInteractive":
        return "Terminal Server session that is both remote and interactive";

      case 11:
      case "CachedInteractive":
        return "Attempt cached credentials without accessing the network";

      case 12:
      case "CachedRemoteInteractive":
        return "Terminal Server session that is both remote and interactive (used for internal auditing)";

      case 13:
      case "CachedUnlock":
        return "Workstation logon";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_user_account_type = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 256: return "Local user account for user who has a primary account in another domain";
      case 512: return "Default account type that represents a typical user";
      case 2048: return "Account for a system domain that trusts other domains";
      case 4096: return "Computer account for a Windows NT/Windows 2000 machine that is a member of this domain";
      case 8192: return "Account for a system backup domain controller that is a member of this domain";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_privilege = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 0: return "Guest";
      case 1: return "User";
      case 2: return "Administrator";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_pass_age = function(age)
  {
    if(String(age).indexOf(".") != -1)
    {
      var ages = String(age);
      var yrs = parseInt(ages.substring(0, 4)), mnths = parseInt(ages.substring(4, 6)),
           ds = parseInt(ages.substring(6, 8)),   hrs = parseInt(ages.substring(8, 10)),
           mn = parseInt(ages.substring(10, 12));

      return ((yrs > 0) ? yrs + " years" + ((mnths > 0) || (ds > 0) || (hrs > 0) || (mn > 0) ? ", " : "") : "") +
             ((mnths > 0) ? mnths + " months" + ((ds > 0) || (hrs > 0) || (mn > 0) ? ", " : "") : "") +
             ((ds > 0) ? ds + " days" + ((hrs > 0) || (mn > 0) ? ", " : "") : "") +
             ((hrs > 0) ? hrs + " hours" + ((mn > 0) ? ", " : "") : "") +
             ((mn > 0) ? mn + " minutes" : "");
    }
    else
      return age;
  }

  this._translate_application_boost = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 0: return "None";
      case 1: return "Minimum";
      case 2: return "Maximum";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_type_of_os = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "Other";
      case 2: return "MACOS";
      case 3: return "ATTUNIX";
      case 4: return "DGUX";
      case 5: return "DECNT";
      case 6: return "Digital Unix";
      case 7: return "OpenVMS";
      case 8: return "HPUX";
      case 9: return "AIX";
      case 10: return "MVS";
      case 11: return "OS400";
      case 12: return "OS/2";
      case 13: return "JavaVM";
      case 14: return "MSDOS";
      case 15: return "WIN3x";
      case 16: return "WIN95";
      case 17: return "WIN98";
      case 18: return "WINNT";
      case 19: return "WINCE";
      case 20: return "NCR3000";
      case 21: return "NetWare";
      case 22: return "OSF";
      case 23: return "DC/OS";
      case 24: return "Reliant UNIX";
      case 25: return "SCO UnixWare";
      case 26: return "SCO OpenServer";
      case 27: return "Sequent";
      case 28: return "IRIX";
      case 29: return "Solaris";
      case 30: return "SunOS";
      case 31: return "U6000";
      case 32: return "ASERIES";
      case 33: return "TandemNSK";
      case 34: return "TandemNT";
      case 35: return "BS2000";
      case 36: return "LINUX";
      case 37: return "Lynx";
      case 38: return "XENIX";
      case 39: return "VM/ESA";
      case 40: return "Interactive UNIX";
      case 41: return "BSDUNIX";
      case 42: return "FreeBSD";
      case 43: return "NetBSD";
      case 44: return "GNU Hurd";
      case 45: return "OS9";
      case 46: return "MACH Kernel";
      case 47: return "Inferno";
      case 48: return "QNX";
      case 49: return "EPOC";
      case 50: return "IxWorks";
      case 51: return "VxWorks";
      case 52: return "MiNT";
      case 53: return "BeOS";
      case 54: return "HP MPE";
      case 55: return "NextStep";
      case 56: return "PalmPilot";
      case 57: return "Rhapsody";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_language_of_os = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 0x0001: return "Arabic";
      case 0x0004: return "Chinese";
      case 0x0009: return "English";
      case 0x0401: return "Arabic (Saudi Arabia)";
      case 0x0402: return "Bulgarian";
      case 0x0403: return "Catalan";
      case 0x0404: return "Chinese (Taiwan)";
      case 0x0405: return "Czech";
      case 0x0406: return "Danish";
      case 0x0407: return "German (Germany)";
      case 0x0408: return "Greek";
      case 0x0409: return "English (United States)";
      case 0x040A: return "Spanish (Traditional Sort)";
      case 0x040B: return "Finnish";
      case 0x040C: return "French (France)";
      case 0x040D: return "Hebrew";
      case 0x040E: return "Hungarian";
      case 0x040F: return "Icelandic";
      case 0x0410: return "Italian (Italy)";
      case 0x0411: return "Japanese";
      case 0x0412: return "Korean";
      case 0x0413: return "Dutch (Netherlands)";
      case 0x0414: return "Norwegian (Bokmal)";
      case 0x0415: return "Polish";
      case 0x0416: return "Portuguese (Brazil)";
      case 0x0417: return "Rhaeto-Romanic";
      case 0x0418: return "Romanian";
      case 0x0419: return "Russian";
      case 0x041A: return "Croatian";
      case 0x041B: return "Slovak";
      case 0x041C: return "Albanian";
      case 0x041D: return "Swedish";
      case 0x041E: return "Thai";
      case 0x041F: return "Turkish";
      case 0x0420: return "Urdu";
      case 0x0421: return "Indonesian";
      case 0x0422: return "Ukrainian";
      case 0x0423: return "Belarusian";
      case 0x0424: return "Slovenian";
      case 0x0425: return "Estonian";
      case 0x0426: return "Latvian";
      case 0x0427: return "Lithuanian";
      case 0x0429: return "Farsi";
      case 0x042A: return "Vietnamese";
      case 0x042D: return "Basque";
      case 0x042E: return "Sorbian";
      case 0x042F: return "Macedonian (FYROM)";
      case 0x0430: return "Sutu";
      case 0x0431: return "Tsonga";
      case 0x0432: return "Tswana";
      case 0x0434: return "Xhosa";
      case 0x0435: return "Zulu";
      case 0x0436: return "Afrikaans";
      case 0x0438: return "Faeroese";
      case 0x0439: return "Hindi";
      case 0x043A: return "Maltese";
      case 0x043C: return "Gaelic";
      case 0x043D: return "Yiddish";
      case 0x043E: return "Malay (Malaysia)";
      case 0x0801: return "Arabic (Iraq)";
      case 0x0804: return "Chinese (PRC)";
      case 0x0807: return "German (Switzerland)";
      case 0x0809: return "English (United Kingdom)";
      case 0x080A: return "Spanish (Mexico)";
      case 0x080C: return "French (Belgium)";
      case 0x0810: return "Italian (Switzerland)";
      case 0x0813: return "Dutch (Belgium)";
      case 0x0814: return "Norwegian (Nynorsk)";
      case 0x0816: return "Portuguese (Portugal)";
      case 0x0818: return "Romanian (Moldova)";
      case 0x0819: return "Russian (Moldova)";
      case 0x081A: return "Serbian (Latin)";
      case 0x081D: return "Swedish (Finland)";
      case 0x0C01: return "Arabic (Egypt)";
      case 0x0C04: return "Chinese (Hong Kong SAR)";
      case 0x0C07: return "German (Austria)";
      case 0x0C09: return "English (Australia)";
      case 0x0C0A: return "Spanish (International Sort)";
      case 0x0C0C: return "French (Canada)";
      case 0x0C1A: return "Serbian (Cyrillic)";
      case 0x1001: return "Arabic (Libya)";
      case 0x1004: return "Chinese (Singapore)";
      case 0x1007: return "German (Luxembourg)";
      case 0x1009: return "English (Canada)";
      case 0x100A: return "Spanish (Guatemala)";
      case 0x100C: return "French (Switzerland)";
      case 0x1401: return "Arabic (Algeria)";
      case 0x1407: return "German (Liechtenstein)";
      case 0x1409: return "English (New Zealand)";
      case 0x140A: return "Spanish (Costa Rica)";
      case 0x140C: return "French (Luxembourg)";
      case 0x1801: return "Arabic (Morocco)";
      case 0x1809: return "English (Ireland)";
      case 0x180A: return "Spanish (Panama)";
      case 0x1C01: return "Arabic (Tunisia)";
      case 0x1C09: return "English (South Africa)";
      case 0x1C0A: return "Spanish (Dominican Republic)";
      case 0x2001: return "Arabic (Oman)";
      case 0x2009: return "English (Jamaica)";
      case 0x200A: return "Spanish (Venezuela)";
      case 0x2401: return "Arabic (Yemen)";
      case 0x240A: return "Spanish (Colombia)";
      case 0x2801: return "Arabic (Syria)";
      case 0x2809: return "English (Belize)";
      case 0x280A: return "Spanish (Peru)";
      case 0x2C01: return "Arabic (Jordan)";
      case 0x2C09: return "English (Trinidad)";
      case 0x2C0A: return "Spanish (Argentina)";
      case 0x3001: return "Arabic (Lebanon)";
      case 0x300A: return "Spanish (Ecuador)";
      case 0x3401: return "Arabic (Kuwait)";
      case 0x340A: return "Spanish (Chile)";
      case 0x3801: return "Arabic (U.A.E.)";
      case 0x380A: return "Spanish (Uruguay)";
      case 0x3C01: return "Arabic (Bahrain)";
      case 0x3C0A: return "Spanish (Paraguay)";
      case 0x4001: return "Arabic (Qatar)";
      case 0x400A: return "Spanish (Bolivia)";
      case 0x440A: return "Spanish (El Salvador)";
      case 0x480A: return "Spanish (Honduras)";
      case 0x4C0A: return "Spanish (Nicaragua)";
      case 0x500A: return "Spanish (Puerto Rico)";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_domain_role = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 0: return "Standalone Workstation";
      case 1: return "Member Workstation";
      case 2: return "Standalone Server";
      case 3: return "Member Server";
      case 4: return "Backup Domain Controller";
      case 5: return "Primary Domain Controller";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_power_state = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "Full Power";
      case 2: return "Power Save - Low Power Mode";
      case 3: return "Power Save - Standby";
      case 4: return "Power Save - Unknown";
      case 5: return "Power Cycle";
      case 6: return "Power Off";
      case 7: return "Power Save - Warning";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_power_supply_state = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "Other";
      case 3: return "Safe";
      case 4: return "Warning";
      case 5: return "Critical";
      case 6: return "Non-recoverable";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_wake_up = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 0: return "Reserved";
      case 1: return "Other";
      case 3: return "APM Timer";
      case 4: return "Modem Ring";
      case 5: return "LAN Remote";
      case 6: return "Power Switch";
      case 7: return "PCI PME#";
      case 8: return "AC Power Restored";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_debug_info_type = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 0: return "None";
      case 1: return "Complete memory dump";
      case 2: return "Kernel memory dump";
      case 3: return "Small memory dump";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_odbc_registraton = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 0: return "Per machine";
      case 1: return "Per user";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_true_false = function(code)
  {
    if(this._isempty(code)) return "";

    return (code == 1) ? "True" : "False";
  }

  this._translate_conseq_capabilities = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "Other";
      case 2: return "Sequential Access";
      case 3: return "Random Access";
      case 4: return "Supports Writing";
      case 5: return "Encryption";
      case 6: return "Compression";
      case 7: return "Supports Removable Media";
      case 8: return "Manual Cleaning";
      case 9: return "Automatic Cleaning";
      case 10: return "SMART Notification";
      case 11: return "Supports Dual Sided Media";
      case 12: return "Predismount Eject Not Required";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_answer_mode = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 2: return "Other";
      case 3: return "Disabled";
      case 4: return "Manual Answer";
      case 5: return "Auto Answer";
      case 6: return "Auto Answer with Call-Back";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_dial_tone = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "Tone";
      case 2: return "Pulse";

      default: return "Unknown (" + String(code) + ")";
    }
  }

  this._translate_modem_port = function(code)
  {
    if(this._isempty(code)) return "";

    switch(parseInt(code.charAt(2)))
    {
      case 0: return "Parallel Port";
      case 1: return "Serial Port";
      case 2: return "Modem";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_print_color = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "Monochrome";
      case 2: return "Color";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_print_dither_type = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "No Dithering";
      case 2: return "Coarse Brush";
      case 3: return "Fine Brush";
      case 4: return "Line Art";
      case 5: return "Greyscale";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_print_icm_intent = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "Saturation";
      case 2: return "Contrast";
      case 3: return "Exact Color";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_print_icm_method = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "Disabled";
      case 2: return "Windows";
      case 3: return "Device Driver";
      case 4: return "Device";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_print_media_type = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "Standard";
      case 2: return "Transparency";
      case 3: return "Glossy";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_print_orientation = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "Portrait";
      case 2: return "Landscape";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_print_true_type_option = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 1: return "TrueType fonts as graphics";
      case 2: return "TrueType fonts as soft fonts (PCL printers)";
      case 3: return "Substitute device fonts for TrueType fonts";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_service_philosophy = function(code)
  {
    if(this._isempty(code)) return "";

    switch(code)
    {
      case 0: return "Unknown";
      case 2: return "Service From Top";
      case 3: return "Service From Front";
      case 4: return "Service From Back";
      case 5: return "Service From Side";
      case 6: return "Sliding Trays";
      case 7: return "Removable Sides";
      case 8: return "Moveable";

      default: return "Other (" + String(code) + ")";
    }
  }

  this._translate_chassis_type = function(code)
  {
    if(this._isempty(code)) return "";

    switch(Number(code))
    {
      case 2:  return "Unknown";
      case 3:  return "Desktop";
      case 4:  return "Low Profile Desktop";
      case 5:  return "Pizza Box";
      case 6:  return "Mini Tower";
      case 7:  return "Tower";
      case 8:  return "Portable";
      case 9:  return "Laptop";
      case 10: return "Notebook";
      case 11: return "Hand Held";
      case 12: return "Docking Station";
      case 13: return "All in One";
      case 14: return "Sub Notebook";
      case 15: return "Space-Saving";
      case 16: return "Lunch Box";
      case 17: return "Main System Chassis";
      case 18: return "Expansion Chassis";
      case 19: return "SubChassis";
      case 20: return "Bus Expansion Chassis";
      case 21: return "Peripheral Chassis";
      case 22: return "Storage Chassis";
      case 23: return "Rack Mount Chassis";
      case 24: return "Sealed-Case PC";

      default: return "Other (" + String(code) + ")";
    }
  }

  this.init(ips, username, password, domain, kerberos, components,
			component_start_callback, component_complete_callback,
			ip_start_callback, ip_complete_callback, finish_callback);
};

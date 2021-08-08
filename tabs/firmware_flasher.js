/*global $,nwdialog*/
//'use strict';

TABS.firmware_flasher = {};
TABS.firmware_flasher.initialize = function (callback) {

    if (GUI.active_tab != 'firmware_flasher') {
        GUI.active_tab = 'firmware_flasher';
        googleAnalytics.sendAppView('Firmware Flasher');
    }


    var intel_hex = false; // standard intel hex in string format
    var parsed_hex = false; // parsed raw hex in array format

    GUI.load("./tabs/firmware_flasher.html", function () {
        // translate to user-selected language
        localize();

        function enable_load_online_button() {
            $(".load_remote_file").text(chrome.i18n.getMessage('firmwareFlasherButtonLoadOnline')).removeClass('disabled');
        }

        function parse_hex(str, callback) {
            // parsing hex in different thread
            var worker = new Worker('./build/hex_parser.js');

            // "callback"
            worker.onmessage = function (event) {
                callback(event.data);
            };

            // send data/string over for processing
            worker.postMessage(str);
        }


        $('input.show_development_releases').click(function(){
            buildBoardOptions();
        });

        var buildBoardOptions = function(){

            var boards_e = $('select[name="board"]').empty();
            var showDevReleases = ($('input.show_development_releases').is(':checked'));
            boards_e.append($("<option value='0'>{0}</option>".format(chrome.i18n.getMessage('firmwareFlasherOptionLabelSelectBoard'))));

            var versions_e = $('select[name="firmware_version"]').empty();
            versions_e.append($("<option value='0'>{0}</option>".format(chrome.i18n.getMessage('firmwareFlasherOptionLabelSelectFirmwareVersion'))));

            var releases = {};
            var sortedTargets = [];
            var unsortedTargets = [];
            TABS.firmware_flasher.releasesData.forEach(function(release){
                //release.assets.forEach(function(asset){
                    var result = release.url;

                    var board_type = release.platform;

                    // if ((!showDevReleases && release.prerelease) || !result) {
                    //     return;
                    // }
                     if($.inArray(board_type, unsortedTargets) == -1) {
                         unsortedTargets.push(board_type);
                     }
                //});
            });
            sortedTargets = unsortedTargets.sort();

            sortedTargets.forEach(function(release) {
                releases[release] = [];
            });

            TABS.firmware_flasher.releasesData.forEach(function(release){

               // var versionFromTagExpression = /v?(.*)/;
               // var matchVersionFromTag = versionFromTagExpression.exec(release.tag_name);
                var version = release['mav-firmware-version'];//matchVersionFromTag[1];

                //release.assets.forEach(function(asset){
                    //var result = release.url;
                    // if ((!showDevReleases && release.prerelease) || !result) {
                    //     return;
                    // }

                    //  if (release.format != 'hex') { // or .apj   
                    //      return; // buzz todo. for now we use only firmwares that are _bl.hex files that can be flashed with dfu
                    //  }

                    // buzz todo - this file type is great for flashing with DFU, but we aren't doing that here..
                    // if (! release.url.endsWith('_with_bl.hex')) { 
                    //    return; // buzz todo. for now we use only firmwares that are _bl.hex files that can be flashed with dfu
                    //}
                    if (! release.url.endsWith('.apj')) { 
                        return; // buzz todo. for now we use only firmwares that are .apj files that can be flashed with bootloader
                    }

                    // var date = new Date("2001-01-01"); // buzz hack, no date data in ardu json
                    // var formattedDate = "{0}-{1}-{2} {3}:{4}".format(
                    //         date.getFullYear(),
                    //         date.getMonth() + 1,
                    //         date.getDate(),
                    //         date.getUTCHours(),
                    //         date.getMinutes()
                    // );

                    var descriptor = {
                        "releaseUrl": release.url,
                        "name"      : version,//semver.clean(release.name),
                       // "version"   : release.tag_name,
                        "url"       : release.url,
                        "file"      : release.platform,
                        "target"    : release.platform,
                        "date"      : release['mav-type'],//formattedDate,
                        "notes"     : "",//release.body,
                        "status"    : release['mav-firmware-version-type'],
                                    // UID = name~target~date~status
                        "filename"  : release.url.replace("https://firmware.ardupilot.org/",''), // strip leading url part, leave file path+name
                        "uid"       : version+"~"+release.platform+"~"+release['mav-type']+"~"+release['mav-firmware-version-type']+"~"
                    };
                    //releases[descriptor['uid']].push(descriptor);
                    releases[release.platform].push(descriptor);
                //});
            });
            var selectTargets = [];
            Object.keys(releases)
                .sort()
                .forEach(function(target, i) {
                    var descriptors = releases[target];
                    descriptors.forEach(function(descriptor){
                        if($.inArray(target, selectTargets) == -1) {
                            selectTargets.push(target);
                            var select_e =
                                    $("<option value='{0}'>{0}</option>".format(
                                            descriptor.target
                                    )).data('summary', descriptor);
                            boards_e.append(select_e);
                        }
                    });
                });
            TABS.firmware_flasher.releases = releases;
        };


       // https://firmware.oborne.me/manifest.json.gz
       // https://firmware.ardupilot.org/manifest.json.gz
       

        $.get('https://firmware.ardupilot.org/manifest.json', function (releasesData){
            TABS.firmware_flasher.releasesData = releasesData.firmware;
            buildBoardOptions();

            // bind events
            $('select[name="board"]').change(function() {

                $("a.load_remote_file").addClass('disabled');
                var target = $(this).val();

                if (!GUI.connect_lock) {
                    $('.progress').val(0).removeClass('valid invalid');
                    $('span.progressLabel').text(chrome.i18n.getMessage('firmwareFlasherLoadFirmwareFile'));
                    $('div.git_info').slideUp();
                    $('div.release_info').slideUp();
                    $('a.flash_firmware').addClass('disabled');

                    var versions_e = $('select[name="firmware_version"]').empty();
                    if(target == 0) {
                        versions_e.append($("<option value='0'>{0}</option>".format(chrome.i18n.getMessage('firmwareFlasherOptionLabelSelectFirmwareVersion'))));
                    } else {
                        versions_e.append($("<option value='0'>{0} {1}</option>".format(chrome.i18n.getMessage('firmwareFlasherOptionLabelSelectFirmwareVersionFor'), target)));
                    }

                    TABS.firmware_flasher.releases[target].forEach(function(descriptor) {

                        if ( descriptor.date.startsWith("ANTENNA")) return; // skip all antenna_trackers

                        var select_e =
                                $("<option value='{0}'>{1} - {2} - {3} ({4})- {5}</option>".format(
                                        descriptor.uid,
                                        descriptor.name,
                                        descriptor.target,
                                        descriptor.date,
                                        descriptor.status,
                                        descriptor.filename
                                )).data('summary', descriptor);

                        versions_e.append(select_e);
                    });
                }
            });

        }).fail(function (data){
            if (data["responseJSON"]){
                GUI.log("<b>GITHUB Query Failed: <code>{0}</code></b>".format(data["responseJSON"].message));
            }
            $('select[name="release"]').empty().append('<option value="0">Offline</option>');
        });

        $('a.load_file').on('click', function () {

            nwdialog.setContext(document);
            nwdialog.openFileDialog('.apj', function(filename) { // buzz todo was .hex, not tested
                const fs = require('fs');
                
                $('div.git_info').slideUp();

                console.log('Loading file from: ' + filename);

                fs.readFile(filename, (err, data) => {

                    if (err) {
                        console.log("Error loading local file", err);
                        return;
                    }

                    console.log('File loaded');

                    parse_hex(data.toString(), function (data) {
                        parsed_hex = data;

                        if (parsed_hex) {
                            googleAnalytics.sendEvent('Flashing', 'Firmware', 'local');
                            $('a.flash_firmware').removeClass('disabled');

                            $('span.progressLabel').text('Loaded Local Firmware: (' + parsed_hex.bytes_total + ' bytes)');
                        } else {
                            $('span.progressLabel').text(chrome.i18n.getMessage('firmwareFlasherHexCorrupted'));
                        }
                    });
                });

            });

        });

        /**
         * Lock / Unlock the firmware download button according to the firmware selection dropdown.
         */
        $('select[name="firmware_version"]').change(function(evt){
            $('div.release_info').slideUp();
            $('a.flash_firmware').addClass('disabled');
            if (evt.target.value=="0") {
                $("a.load_remote_file").addClass('disabled');
            }
            else {
                enable_load_online_button();
            }
        });

        $('a.load_remote_file').click(function (evt) {

            if ($('select[name="firmware_version"]').val() == "0") {
                GUI.log("<b>No firmware selected to load</b>");
                return;
            }

            function process_hex(data, summary) { // data = .get from summary.url
                intel_hex = data;

                // process_hex outsources most of this to parse_hex ( which is in a worker), but afterwards triggers an event/callback... 

                parse_hex(intel_hex, function (data) {
                    parsed_hex = data;  // come from hex_parser.js -> result{} object 

                    console.log("process_hex/parse_hex completed...")

                    if (parsed_hex) { //TABS.firmware_flasher.parsed_hex
                        var url;

                        console.log(" parsed_hex = true =>"+ parsed_hex.bytes_total+' bytes')

                        googleAnalytics.sendEvent('Flashing', 'Firmware', 'online');
                        $('span.progressLabel').html('<a class="save_firmware" href="#" title="Save Firmware">Loaded Online Firmware: (' + parsed_hex.bytes_total + ' bytes)</a>');

                        $('a.flash_firmware').removeClass('disabled');

                        if (summary.commit) {
                            $.get('https://api.github.com/repos/ArduPilot/ardupilot/commits/' + summary.commit, function (data) {
                                var data = data,
                                    d = new Date(data.commit.author.date),
                                    offset = d.getTimezoneOffset() / 60,
                                    date;

                                date = d.getFullYear() + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + ('0' + (d.getDate())).slice(-2);
                                date += ' @ ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
                                date += (offset > 0) ? ' GMT+' + offset : ' GMT' + offset;

                                $('div.git_info .committer').text(data.commit.author.name);
                                $('div.git_info .date').text(date);
                                $('div.git_info .hash').text(data.sha.slice(0, 7)).prop('href', 'https://api.github.com/repos/ArduPilot/ardupilot/commit/' + data.sha);

                                $('div.git_info .message').text(data.commit.message);

                                $('div.git_info').slideDown();
                            });
                        }

                        $('div.release_info .target').text(summary.target);

                        var status_e = $('div.release_info .status');
                        if (summary.status == 'release-candidate') {
                            $('div.release_info .status').html(chrome.i18n.getMessage('firmwareFlasherReleaseStatusReleaseCandidate')).show();
                        } else {
                            status_e.hide();
                        }

                        $('div.release_info .name').text(summary.name).prop('href', summary.releaseUrl);
                        $('div.release_info .date').text(summary.date);
                        $('div.release_info .status').text(summary.status);
                        $('div.release_info .file').text(summary.file).prop('href', summary.url);

                        var formattedNotes = marked(summary.notes);
                        $('div.release_info .notes').html(formattedNotes);
                        // Make links in the release notes open in a new window
                        $('div.release_info .notes a').each(function () {
                            $(this).attr('target', '_blank');
                        });

                        $('div.release_info').slideDown();

                    } else {
                        $('span.progressLabel').text(chrome.i18n.getMessage('firmwareFlasherHexCorrupted'));
                    }
                });
            }

            function failed_to_load() {
                $('span.progressLabel').text(chrome.i18n.getMessage('firmwareFlasherFailedToLoadOnlineFirmware'));
                $('a.flash_firmware').addClass('disabled');
                enable_load_online_button();
            }

            function process_apj(data, summary) { // an apj is really a json file

                // parse json, get bin blob out
                var j = JSON.parse(data);

                var binblob = j.image; // this is still base64 encoded
                j.image = '';// remove it from json b4 display as its huge
                console.log(j)// thte remainder of the json

                
                //self.hex = atob(binblob); // remove base64 encoding; 

                // at this point self.hex is a "string"

                function _base64ToArrayBuffer(base64) {
                    var binary_string = window.atob(base64);
                    var len = binary_string.length;
                    var bytes = new Uint8Array(len);
                    for (var i = 0; i < len; i++) {
                        bytes[i] = binary_string.charCodeAt(i);
                    }
                    return bytes.buffer;
                }

                self.hex = _base64ToArrayBuffer(binblob);

                // at this point self.hex is a real Uint8Array()

                /*
                {board_id: 9,
                USBID: "0x1209/0x5741"
                board_id: 9
                board_revision: 0
                description: "Firmware for a STM32F427xx board"
                git_identity: "0bb18a15"
                image: "xxxxxxx"
                image_size: 1009552
                magic: "APJFWv1"
                summary: "Pixhawk1-1M"
                version: "0.1"
                }
                */

                // for compat, shove a few things into parsed_hex  ( its the result format that hex_parser.js uses, but we don't use that parser here.
                parsed_hex ={
                    'bytes_total' : self.hex.length, 
                    'data' : self.hex,
                };

                // todo basic check:
                //if ( j.board_id != xxxx )

                $('span.progressLabel').html('<a class="save_firmware" href="#" title="Save Firmware">Loaded Online Firmware: (' + parsed_hex.bytes_total + ' bytes)</a>');

                $('a.flash_firmware').removeClass('disabled');

                $('div.release_info .target').text(summary.target);
                $('div.release_info .status').html(chrome.i18n.getMessage('firmwareFlasherReleaseStatusReleaseCandidate')).show();
                $('div.release_info .name').text(summary.name).prop('href', summary.releaseUrl);
                $('div.release_info .date').text(summary.date);
                $('div.release_info .status').text(summary.status);
                $('div.release_info .file').text(summary.file).prop('href', summary.url);

                var formattedNotes = marked(summary.notes);
                $('div.release_info .notes').html(formattedNotes);
                // Make links in the release notes open in a new window
                $('div.release_info .notes a').each(function () {
                    $(this).attr('target', '_blank');
                });

                $('div.release_info').slideDown();

                console.log(" parsed APJ = true =>"+ parsed_hex.bytes_total+' bytes')

            }

            var summary = $('select[name="firmware_version"] option:selected').data('summary');
            if (summary) { // undefined while list is loading or while running offline
                //$(".load_remote_file").text(chrome.i18n.getMessage('firmwareFlasherButtonLoading')).addClass('disabled');
                console.log("getting firmware from url:",summary.url);
                $.get(summary.url, function (data) {
                    enable_load_online_button();
                    //process_hex(data, summary);
                    process_apj(data, summary);
                }).fail(failed_to_load);
            } else {
                $('span.progressLabel').text(chrome.i18n.getMessage('firmwareFlasherFailedToLoadOnlineFirmware'));
            }
        });

        $('a.flash_firmware2').click(function () { //Buzz2


            //var port = "/dev/ttyACM0";

            var port = String($('div#port-picker #port').val())

            //(port, baud, hex,


            //------------------

            var up = new uploader(port,
                115200,//args.baud_bootloader,
                57600,//baud_flightstack,
                115200,//args.baud_bootloader_flash,
                1,//args.target_system,
                1,//args.target_component,
                255,//args.source_system,
                0,//args.source_component
                );
    
                //-----------

        
        });

        

        $('a.flash_firmware').click(function () {
            if (!$(this).hasClass('disabled')) {
                if (!GUI.connect_lock) { // button disabled while flashing is in progress
                    if (parsed_hex != false) {
                        var options = {};

                        if ($('input.erase_chip').is(':checked')) {
                            options.erase_chip = true;
                        }

                        if (String($('div#port-picker #port').val()) != 'DFU') {
                            if (String($('div#port-picker #port').val()) != '0') {
                                var port = String($('div#port-picker #port').val()),
                                    baud;

                                switch (GUI.operating_system) {
                                    case 'Windows':
                                    case 'MacOS':
                                    case 'ChromeOS':
                                    case 'Linux':
                                    case 'UNIX':
                                        baud = 921600;
                                        break;

                                    default:
                                        baud = 115200;
                                }

                                if ($('input.updating').is(':checked')) {
                                    options.no_reboot = true;
                                } else {
                                    options.reboot_baud = parseInt($('div#port-picker #baud').val());
                                }

                                if ($('input.flash_manual_baud').is(':checked')) {
                                    baud = parseInt($('#flash_manual_baud_rate').val());
                                }
                                // buzz todo, integrate ardu bootloader based on vid /pid detect?


                                //STM32.connect(port, baud, parsed_hex, options);
                                PX4.connect(port, baud, parsed_hex, options);
                            } else {
                                console.log('Please select valid serial port');
                                GUI.log('<span style="color: red">Please select valid serial port</span>');
                            }
                        } else {
                            STM32DFU.connect(usbDevices.STM32DFU, parsed_hex, options);
                        }
                    } else {
                        $('span.progressLabel').text(chrome.i18n.getMessage('firmwareFlasherFirmwareNotLoaded'));
                    }
                }
            }
        });

        $(document).on('click', 'span.progressLabel a.save_firmware', function () {
            chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: 'ARDUPILOT', accepts: [{extensions: ['hex']}]}, function (fileEntry) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    return;
                }

                chrome.fileSystem.getDisplayPath(fileEntry, function (path) {
                    console.log('Saving firmware to: ' + path);

                    // check if file is writable
                    chrome.fileSystem.isWritableEntry(fileEntry, function (isWritable) {
                        if (isWritable) {
                            var blob = new Blob([intel_hex], {type: 'text/plain'});

                            fileEntry.createWriter(function (writer) {
                                var truncated = false;

                                writer.onerror = function (e) {
                                    console.error(e);
                                };

                                writer.onwriteend = function() {
                                    if (!truncated) {
                                        // onwriteend will be fired again when truncation is finished
                                        truncated = true;
                                        writer.truncate(blob.size);

                                        return;
                                    }
                                };

                                writer.write(blob);
                            }, function (e) {
                                console.error(e);
                            });
                        } else {
                            console.log('You don\'t have write permissions for this file, sorry.');
                            GUI.log('You don\'t have <span style="color: red">write permissions</span> for this file');
                        }
                    });
                });
            });
        });

        chrome.storage.local.get('no_reboot_sequence', function (result) {
            if (result.no_reboot_sequence) {
                $('input.updating').prop('checked', true);
                $('.flash_on_connect_wrapper').show();
            } else {
                $('input.updating').prop('checked', false);
                $('.flash_on_connect_wrapper').show();// buzz hack

            }

            // bind UI hook so the status is saved on change
            $('input.updating').change(function() {
                var status = $(this).is(':checked');

                if (status) {
                    $('.flash_on_connect_wrapper').show();
                } else {
                    $('input.flash_on_connect').prop('checked', false).change();
                    $('.flash_on_connect_wrapper').hide();
                }

                chrome.storage.local.set({'no_reboot_sequence': status});
            });

            $('input.updating').change();
        });

        chrome.storage.local.get('flash_manual_baud', function (result) {
            if (result.flash_manual_baud) {
                $('input.flash_manual_baud').prop('checked', true);
            } else {
                $('input.flash_manual_baud').prop('checked', false);
            }

            // bind UI hook so the status is saved on change
            $('input.flash_manual_baud').change(function() {
                var status = $(this).is(':checked');
                chrome.storage.local.set({'flash_manual_baud': status});
            });

            $('input.flash_manual_baud').change();
        });

        chrome.storage.local.get('flash_manual_baud_rate', function (result) {
            $('#flash_manual_baud_rate').val(result.flash_manual_baud_rate);

            // bind UI hook so the status is saved on change
            $('#flash_manual_baud_rate').change(function() {
                var baud = parseInt($('#flash_manual_baud_rate').val());
                chrome.storage.local.set({'flash_manual_baud_rate': baud});
            });

            $('input.flash_manual_baud_rate').change();
        });

        chrome.storage.local.get('flash_on_connect', function (result) {
            if (result.flash_on_connect) {
                $('input.flash_on_connect').prop('checked', true);
            } else {
                $('input.flash_on_connect').prop('checked', true); //false buzz hack to force it on  "flash_on_connect" works to get us into BL, "Flash firmware" button doesn't.
            }

            $('input.flash_on_connect').change(function () {
                var status = $(this).is(':checked');

                if (status) {
                    var catch_new_port = function () {
                        PortHandler.port_detected('flash_detected_device', function (result) {
                            var port = result[0];

                            if (!GUI.connect_lock) {
                                GUI.log('Detected: <strong>' + port + '</strong> - triggering flash on connect');
                                console.log('Detected: ' + port + ' - triggering flash on connect');

                                // Trigger regular Flashing sequence
                                helper.timeout.add('initialization_timeout', function () {
                                    $('a.flash_firmware').click();
                                }, 100); // timeout so bus have time to initialize after being detected by the system
                            } else {
                                GUI.log('Detected <strong>' + port + '</strong> - previous device still flashing, please replug to try again');
                            }

                            // Since current port_detected request was consumed, create new one
                            catch_new_port();
                        }, false, true);
                    };

                    catch_new_port();
                } else {
                    PortHandler.flush_callbacks();
                }

                chrome.storage.local.set({'flash_on_connect': status});
            }).change();
        });

        chrome.storage.local.get('erase_chip', function (result) {
            if (result.erase_chip) {
                $('input.erase_chip').prop('checked', true);
            } else {
                $('input.erase_chip').prop('checked', false);
            }

            // bind UI hook so the status is saved on change
            $('input.erase_chip').change(function () {
                chrome.storage.local.set({'erase_chip': $(this).is(':checked')});
            });

            $('input.erase_chip').change();

        });

        $(document).keypress(function (e) {
            if (e.which == 13) { // enter
                // Trigger regular Flashing sequence
                $('a.flash_firmware').click();
            }
        });

        GUI.content_ready(callback);
    });
}

 // ctrl-shift-pipe for matching jumping to matching brackets in vscode

TABS.firmware_flasher.cleanup = function (callback) {
    PortHandler.flush_callbacks();

    // unbind "global" events
    $(document).unbind('keypress');
    $(document).off('click', 'span.progressLabel a');

    if (callback) callback();
};

